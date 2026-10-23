package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/fsnotify/fsnotify"
)

// Automation copies or syncs Origem to Destino when files change and/or on a
// schedule. Origem/Destino are rclone paths ("conta:pasta" or a local path).
type Automation struct {
	ID           string   `json:"id"`
	Nome         string   `json:"nome"`
	Origem       string   `json:"origem"`
	Destino      string   `json:"destino"`
	Modo         string   `json:"modo"` // "copy" or "sync"
	AoMudar      bool     `json:"aoMudar"`
	IntervaloMin int      `json:"intervaloMin"` // 0 = no schedule
	Ignorar      []string `json:"ignorar"`
	// Historico keeps what a run would overwrite or delete at the destination
	// in a sibling "<destino>-historico/AAAA-MM-DD" folder instead of losing it.
	Historico     bool      `json:"historico"`
	HistoricoDias int       `json:"historicoDias"` // 0 = keep forever
	Ativa         bool      `json:"ativa"`
	CriadaEm      time.Time `json:"criadaEm"`
}

// Run is one execution of an automation.
type Run struct {
	Inicio      time.Time `json:"inicio"`
	Fim         time.Time `json:"fim"`
	Motivo      string    `json:"motivo"` // mudança, agendada, ao iniciar, manual
	Sucesso     bool      `json:"sucesso"`
	Erro        string    `json:"erro,omitempty"`
	Enviados    int64     `json:"enviados"`
	Apagados    int64     `json:"apagados"`
	Bytes       int64     `json:"bytes"`
	Verificados int64     `json:"verificados"`
	JobID       int64     `json:"jobid"`
}

// State is what the panel shows for each automation.
type State struct {
	Rodando    bool       `json:"rodando"`
	Vigiando   bool       `json:"vigiando"`
	AvisoVigia string     `json:"avisoVigia,omitempty"`
	Pendente   bool       `json:"pendente"`
	Proxima    *time.Time `json:"proxima,omitempty"`
	Historico  []Run      `json:"historico"`
	MudancaEm  *time.Time `json:"mudancaEm,omitempty"`
	// HistoricoEm is the folder where old versions are kept, if enabled.
	HistoricoEm string `json:"historicoEm,omitempty"`
}

const (
	debounce     = 30 * time.Second
	startupDelay = 20 * time.Second
	historyLimit = 30
)

type Automations struct {
	dir  string
	rcd  *Rcd
	mu   sync.Mutex
	list []Automation
	st   map[string]*State
	stop context.CancelFunc
	wg   sync.WaitGroup
}

func newAutomations(dir string, rcd *Rcd) *Automations {
	a := &Automations{dir: dir, rcd: rcd, st: map[string]*State{}}
	_ = a.readJSON("automacoes.json", &a.list)
	saved := map[string]*State{}
	if a.readJSON("automacoes-estado.json", &saved) == nil {
		for id, s := range saved {
			a.st[id] = &State{Historico: s.Historico}
		}
	}
	return a
}

func (a *Automations) readJSON(name string, v any) error {
	b, err := os.ReadFile(filepath.Join(a.dir, name))
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}

func (a *Automations) writeJSON(name string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(a.dir, name+".tmp")
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(a.dir, name))
}

func (a *Automations) List() []Automation {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := append([]Automation(nil), a.list...)
	for i := range out {
		if out[i].Ignorar == nil {
			out[i].Ignorar = []string{} // JSON [] rather than null
		}
	}
	return out
}

func (a *Automations) States() map[string]State {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := map[string]State{}
	for id, s := range a.st {
		out[id] = *s
	}
	for _, x := range a.list {
		if root, err := historyRoot(x.Destino); x.Historico && err == nil {
			s := out[x.ID]
			s.HistoricoEm = root
			out[x.ID] = s
		}
	}
	return out
}

func validate(list []Automation) error {
	seen := map[string]bool{}
	for _, x := range list {
		if x.ID == "" || seen[x.ID] {
			return errors.New("identificador inválido")
		}
		seen[x.ID] = true
		if strings.TrimSpace(x.Nome) == "" {
			return errors.New("toda automação precisa de um nome")
		}
		for _, p := range []string{x.Origem, x.Destino} {
			if strings.TrimSpace(p) == "" || strings.IndexFunc(p, unicode.IsControl) >= 0 {
				return fmt.Errorf("%s: origem e destino são obrigatórios", x.Nome)
			}
		}
		if x.Origem == x.Destino {
			return fmt.Errorf("%s: origem e destino são iguais", x.Nome)
		}
		if x.Modo != "copy" && x.Modo != "sync" {
			return fmt.Errorf("%s: modo inválido", x.Nome)
		}
		if x.IntervaloMin != 0 && x.IntervaloMin < 5 {
			return fmt.Errorf("%s: o intervalo mínimo é 5 minutos", x.Nome)
		}
		if !x.AoMudar && x.IntervaloMin == 0 {
			return fmt.Errorf("%s: escolha quando ela deve rodar", x.Nome)
		}
		if x.Historico {
			if _, err := historyRoot(x.Destino); err != nil {
				return fmt.Errorf("%s: %w", x.Nome, err)
			}
			if x.HistoricoDias < 0 || x.HistoricoDias > 3650 {
				return fmt.Errorf("%s: número de dias inválido", x.Nome)
			}
		}
		if x.AoMudar && !isLocal(x.Origem) {
			return fmt.Errorf("%s: só dá para vigiar mudanças numa pasta deste computador", x.Nome)
		}
	}
	return nil
}

// isLocal reports whether p is a path on this computer rather than "conta:pasta".
func isLocal(p string) bool {
	return filepath.IsAbs(p)
}

// Replace saves a new list and restarts the workers.
func (a *Automations) Replace(list []Automation) error {
	if err := validate(list); err != nil {
		return err
	}
	if err := a.writeJSON("automacoes.json", list); err != nil {
		return err
	}
	a.Stop()
	a.mu.Lock()
	a.list = list
	keep := map[string]*State{}
	for _, x := range list {
		if s, ok := a.st[x.ID]; ok {
			keep[x.ID] = &State{Historico: s.Historico}
		} else {
			keep[x.ID] = &State{}
		}
	}
	a.st = keep
	a.mu.Unlock()
	a.saveState()
	a.Start(false)
	return nil
}

// Start launches one worker per active automation. atBoot adds the check
// that runs shortly after the app starts.
func (a *Automations) Start(atBoot bool) {
	ctx, cancel := context.WithCancel(context.Background())
	a.mu.Lock()
	a.stop = cancel
	list := append([]Automation(nil), a.list...)
	for _, x := range list {
		if a.st[x.ID] == nil {
			a.st[x.ID] = &State{}
		}
	}
	a.mu.Unlock()
	for _, x := range list {
		if !x.Ativa {
			continue
		}
		a.wg.Add(1)
		go func(x Automation) {
			defer a.wg.Done()
			a.worker(ctx, x, atBoot)
		}(x)
	}
}

func (a *Automations) Stop() {
	a.mu.Lock()
	stop := a.stop
	a.mu.Unlock()
	if stop != nil {
		stop()
		a.wg.Wait()
	}
}

// RunNow asks a worker to run immediately (from the panel's "Rodar agora").
func (a *Automations) RunNow(id string) error {
	for _, x := range a.List() {
		if x.ID == id {
			go a.run(context.Background(), x, "manual")
			return nil
		}
	}
	return errors.New("automação não encontrada")
}

func (a *Automations) update(id string, f func(*State)) {
	a.mu.Lock()
	if s := a.st[id]; s != nil {
		f(s)
	}
	a.mu.Unlock()
}

func (a *Automations) saveState() {
	a.mu.Lock()
	out := map[string]State{}
	for id, s := range a.st {
		out[id] = State{Historico: s.Historico}
	}
	a.mu.Unlock()
	if err := a.writeJSON("automacoes-estado.json", out); err != nil {
		logErro("automações: não foi possível salvar o estado: %v", err)
	}
}

func (a *Automations) worker(ctx context.Context, x Automation, atBoot bool) {
	changes := make(chan struct{}, 1)
	if x.AoMudar {
		if err := watch(ctx, x.Origem, x.Ignorar, changes); err != nil {
			a.update(x.ID, func(s *State) { s.Vigiando = false; s.AvisoVigia = err.Error() })
			logAviso("automação %q: o vigia de pastas não iniciou: %v", x.Nome, err)
		} else {
			a.update(x.ID, func(s *State) { s.Vigiando = true; s.AvisoVigia = "" })
		}
	}
	defer a.update(x.ID, func(s *State) { s.Vigiando = false; s.Proxima = nil; s.Pendente = false })

	var tick <-chan time.Time
	schedule := func() {
		if x.IntervaloMin > 0 {
			d := time.Duration(x.IntervaloMin) * time.Minute
			next := time.Now().Add(d)
			a.update(x.ID, func(s *State) { s.Proxima = &next })
			tick = time.After(d)
		}
	}
	schedule()

	var boot <-chan time.Time
	if atBoot {
		boot = time.After(startupDelay)
	}
	var quiet <-chan time.Time // fires once changes have stopped for `debounce`
	for {
		select {
		case <-ctx.Done():
			return
		case <-boot:
			boot = nil
			a.run(ctx, x, "ao iniciar")
		case <-tick:
			a.run(ctx, x, "agendada")
			schedule()
		case <-changes:
			now := time.Now()
			a.update(x.ID, func(s *State) { s.Pendente = true; s.MudancaEm = &now })
			quiet = time.After(debounce)
		case <-quiet:
			quiet = nil
			a.run(ctx, x, "mudança")
		}
	}
}

// run executes one copy/sync through rclone and records the result. Runs of
// the same automation never overlap.
func (a *Automations) run(ctx context.Context, x Automation, reason string) {
	busy := false
	a.update(x.ID, func(s *State) {
		busy = s.Rodando
		if !busy {
			s.Rodando = true
			s.Pendente = false
		}
	})
	if busy {
		a.update(x.ID, func(s *State) { s.Pendente = true })
		return
	}
	r := Run{Inicio: time.Now(), Motivo: reason}
	defer func() {
		r.Fim = time.Now()
		a.update(x.ID, func(s *State) {
			s.Rodando = false
			s.Historico = append([]Run{r}, s.Historico...)
			if len(s.Historico) > historyLimit {
				s.Historico = s.Historico[:historyLimit]
			}
		})
		a.saveState()
		if r.Sucesso {
			logInfo("automação %q (%s): concluída — %d enviados, %d apagados", x.Nome, reason, r.Enviados, r.Apagados)
		} else {
			logErro("automação %q (%s): falhou — %s", x.Nome, reason, r.Erro)
		}
	}()

	params := map[string]any{"srcFs": x.Origem, "dstFs": x.Destino, "_async": true}
	if x.Historico {
		// One folder per day; the time suffix keeps every version of a file
		// changed several times in the day (without it the later version would
		// replace the earlier one in the backup).
		root, err := historyRoot(x.Destino)
		if err != nil {
			r.Erro = err.Error()
			return
		}
		now := time.Now()
		params["_config"] = map[string]any{
			"BackupDir":           root + "/" + now.Format("2006-01-02"),
			"Suffix":              "-" + now.Format("150405"),
			"SuffixKeepExtension": true,
		}
	}
	if len(x.Ignorar) > 0 {
		params["_filter"] = map[string]any{"ExcludeRule": x.Ignorar}
	}
	var started struct {
		JobID int64 `json:"jobid"`
	}
	if err := a.rcd.Call(ctx, "sync/"+x.Modo, params, &started); err != nil {
		r.Erro = err.Error()
		return
	}
	r.JobID = started.JobID
	rememberAutomationJob(started.JobID, x)
	for {
		select {
		case <-ctx.Done():
			_ = a.rcd.Call(context.Background(), "job/stop", map[string]any{"jobid": started.JobID}, nil)
			r.Erro = "interrompida"
			return
		case <-time.After(2 * time.Second):
		}
		var st struct {
			Finished bool   `json:"finished"`
			Success  bool   `json:"success"`
			Error    string `json:"error"`
		}
		if err := a.rcd.Call(ctx, "job/status", map[string]any{"jobid": started.JobID}, &st); err != nil {
			continue
		}
		if !st.Finished {
			continue
		}
		var stats struct {
			Bytes     int64 `json:"bytes"`
			Transfers int64 `json:"transfers"`
			Deletes   int64 `json:"deletes"`
			Checks    int64 `json:"checks"`
		}
		_ = a.rcd.Call(ctx, "core/stats", map[string]any{"group": fmt.Sprintf("job/%d", started.JobID)}, &stats)
		r.Sucesso, r.Erro = st.Success, st.Error
		r.Bytes, r.Enviados, r.Apagados, r.Verificados = stats.Bytes, stats.Transfers, stats.Deletes, stats.Checks
		if x.Historico && x.HistoricoDias > 0 {
			a.cleanHistory(ctx, x)
		}
		return
	}
}

// ---------- Folder watching ----------

// ignored reports whether rel (slash-separated, relative to the watched
// folder) matches one of the user's exclude patterns.
func ignored(rel string, rules []string) bool {
	base := path.Base(rel)
	for _, r := range rules {
		r = strings.TrimPrefix(r, "/")
		if strings.HasSuffix(r, "/**") {
			prefix := strings.TrimSuffix(r, "**")
			if strings.HasPrefix(rel+"/", prefix) || strings.Contains("/"+rel+"/", "/"+prefix) {
				return true
			}
			continue
		}
		if ok, _ := path.Match(r, rel); ok {
			return true
		}
		if ok, _ := path.Match(r, base); ok {
			return true
		}
	}
	return false
}

// watch reports (coalesced) changes under root on out until ctx ends. New
// subfolders are watched as they appear.
func watch(ctx context.Context, root string, rules []string, out chan<- struct{}) error {
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return fmt.Errorf("a pasta %s não existe", root)
	}
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	rel := func(p string) string {
		r, err := filepath.Rel(root, p)
		if err != nil {
			return p
		}
		return filepath.ToSlash(r)
	}
	addTree := func(dir string) {
		_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
			if err != nil || !d.IsDir() {
				return nil
			}
			if p != root && ignored(rel(p), rules) {
				return filepath.SkipDir
			}
			if err := w.Add(p); err != nil {
				logAviso("vigia: não foi possível vigiar %s: %v", p, err)
			}
			return nil
		})
	}
	addTree(root)
	go func() {
		defer w.Close()
		for {
			select {
			case <-ctx.Done():
				return
			case ev, ok := <-w.Events:
				if !ok {
					return
				}
				if ignored(rel(ev.Name), rules) {
					continue
				}
				if ev.Op.Has(fsnotify.Create) {
					if fi, err := os.Stat(ev.Name); err == nil && fi.IsDir() {
						addTree(ev.Name)
					}
				}
				select {
				case out <- struct{}{}:
				default:
				}
			case err, ok := <-w.Errors:
				if !ok {
					return
				}
				logAviso("vigia: %v", err)
			}
		}
	}()
	return nil
}

// ---------- Job labels for the panel's Tarefas page ----------

type jobLabel struct {
	Kind      string    `json:"kind"`
	Label     string    `json:"label"`
	Src       string    `json:"src"`
	Dst       string    `json:"dst"`
	StartedAt time.Time `json:"startedAt"`
}

var (
	jobLabelsMu sync.Mutex
	jobLabels   = map[int64]jobLabel{}
)

func rememberAutomationJob(id int64, x Automation) {
	jobLabelsMu.Lock()
	defer jobLabelsMu.Unlock()
	jobLabels[id] = jobLabel{Kind: x.Modo, Label: "Automação: " + x.Nome, Src: x.Origem, Dst: x.Destino, StartedAt: time.Now()}
}

func automationJobLabels() map[int64]jobLabel {
	jobLabelsMu.Lock()
	defer jobLabelsMu.Unlock()
	out := make(map[int64]jobLabel, len(jobLabels))
	for k, v := range jobLabels {
		out[k] = v
	}
	return out
}

// ---------- History ----------

// historyRoot is the folder holding the dated history folders: a sibling of
// the destination ("remote:a/b" -> "remote:a/b-historico"). It cannot live
// inside the destination, which rclone refuses, so a destination that is the
// root of an account or drive has no valid history folder.
func historyRoot(dst string) (string, error) {
	d := strings.TrimRight(strings.ReplaceAll(dst, "\\", "/"), "/")
	i := strings.LastIndex(d, ":")
	rootOfRemote := i >= 0 && i == len(d)-1
	if d == "" || rootOfRemote || (len(d) == 2 && d[1] == ':') {
		return "", errors.New("para guardar versões, o destino precisa ser uma pasta, não a raiz da conta ou do disco")
	}
	return d + "-historico", nil
}

// expiredDays returns the dated folder names ("AAAA-MM-DD") older than the
// retention period, leaving anything that is not a date alone.
func expiredDays(names []string, now time.Time, days int) []string {
	cutoff := now.AddDate(0, 0, -days).Format("2006-01-02")
	var out []string
	for _, n := range names {
		if _, err := time.Parse("2006-01-02", n); err == nil && n < cutoff {
			out = append(out, n)
		}
	}
	return out
}

var cleanedAt sync.Map // automation id -> time of last cleanup

// cleanHistory deletes history folders past the retention period, at most
// once every 20 hours per automation.
func (a *Automations) cleanHistory(ctx context.Context, x Automation) {
	if t, ok := cleanedAt.Load(x.ID); ok && time.Since(t.(time.Time)) < 20*time.Hour {
		return
	}
	root, err := historyRoot(x.Destino)
	if err != nil {
		return
	}
	var list struct {
		List []struct {
			Name  string `json:"Name"`
			IsDir bool   `json:"IsDir"`
		} `json:"list"`
	}
	if err := a.rcd.Call(ctx, "operations/list", map[string]any{"fs": root, "remote": "", "opt": map[string]any{"dirsOnly": true}}, &list); err != nil {
		return // no history folder yet
	}
	var names []string
	for _, e := range list.List {
		if e.IsDir {
			names = append(names, e.Name)
		}
	}
	for _, n := range expiredDays(names, time.Now(), x.HistoricoDias) {
		if err := a.rcd.Call(ctx, "operations/purge", map[string]any{"fs": root, "remote": n}, nil); err != nil {
			logAviso("automação %q: não foi possível apagar o histórico de %s: %v", x.Nome, n, err)
			return
		}
		logInfo("automação %q: histórico de %s apagado (mais de %d dias)", x.Nome, n, x.HistoricoDias)
	}
	cleanedAt.Store(x.ID, time.Now())
}
