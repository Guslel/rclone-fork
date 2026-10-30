package main

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"time"
)

// Ajustes are rclone's performance knobs as the panel exposes them. Zero
// values mean "use the default": the panel-wide setting for a transfer or an
// automation, rclone's own default for the panel-wide setting.
type Ajustes struct {
	Transfers int    `json:"transfers,omitempty"` // files sent at once (--transfers)
	Checkers  int    `json:"checkers,omitempty"`  // files compared at once (--checkers)
	Ordem     string `json:"ordem,omitempty"`     // --order-by
}

// rclone's defaults, restored when a panel-wide field is cleared.
const (
	defaultTransfers = 4
	defaultCheckers  = 8
)

var ordens = map[string]bool{
	"":                   true,
	"size,ascending":     true,
	"size,descending":    true,
	"modtime,descending": true,
	"modtime,ascending":  true,
	"name,ascending":     true,
}

func (a Ajustes) validate() error {
	if a.Transfers < 0 || a.Transfers > 64 {
		return errors.New("arquivos ao mesmo tempo: use de 1 a 64")
	}
	if a.Checkers < 0 || a.Checkers > 64 {
		return errors.New("verificações ao mesmo tempo: use de 1 a 64")
	}
	if !ordens[a.Ordem] {
		return errors.New("ordem de envio inválida")
	}
	return nil
}

// config is the rc "_config" override for the fields that are set.
func (a Ajustes) config() map[string]any {
	c := map[string]any{}
	if a.Transfers > 0 {
		c["Transfers"] = a.Transfers
	}
	if a.Checkers > 0 {
		c["Checkers"] = a.Checkers
	}
	if a.Ordem != "" {
		c["OrderBy"] = a.Ordem
	}
	return c
}

// Desempenho is the panel-wide setting, saved in desempenho.json and applied
// to rclone's global config, which every job copies unless it overrides.
type Desempenho struct {
	Ajustes
	Limite string `json:"limite,omitempty"` // --bwlimit, e.g. "2M"; "" = none
}

type Perf struct {
	path string
	rcd  *Rcd
	mu   sync.Mutex
	cur  Desempenho
}

func newPerf(dir string, rcd *Rcd) *Perf {
	p := &Perf{path: filepath.Join(dir, "desempenho.json"), rcd: rcd}
	_ = readJSONFile(p.path, &p.cur)
	if p.cur.validate() != nil {
		p.cur = Desempenho{}
	}
	return p
}

func (p *Perf) Get() Desempenho {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.cur
}

// Apply pushes the saved setting to rclone (at startup).
func (p *Perf) Apply(ctx context.Context) error {
	return p.push(ctx, p.Get())
}

// Set applies d to rclone and, if that worked, saves it.
func (p *Perf) Set(ctx context.Context, d Desempenho) error {
	if err := d.validate(); err != nil {
		return err
	}
	if err := p.push(ctx, d); err != nil {
		return err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.cur = d
	return writeJSONFile(p.path, d)
}

func (p *Perf) push(ctx context.Context, d Desempenho) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	main := map[string]any{"Transfers": defaultTransfers, "Checkers": defaultCheckers, "OrderBy": ""}
	for k, v := range d.config() {
		main[k] = v
	}
	if err := p.rcd.Call(ctx, "options/set", map[string]any{"main": main}, nil); err != nil {
		return err
	}
	rate := d.Limite
	if rate == "" {
		rate = "off"
	}
	return p.rcd.Call(ctx, "core/bwlimit", map[string]any{"rate": rate}, nil)
}
