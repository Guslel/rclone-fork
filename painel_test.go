package main

import (
	"bytes"
	"os"
	"strings"
	"testing"
	"time"
)

func TestVerifiedSums(t *testing.T) {
	sums, err := os.ReadFile("testdata/SHA256SUMS")
	if err != nil {
		t.Fatal(err)
	}
	signed, err := verifiedSums(sums)
	if err != nil {
		t.Fatalf("genuine SHA256SUMS rejected: %v", err)
	}
	if !strings.Contains(string(signed), "rclone-v1.75.2-windows-amd64.zip") {
		t.Fatal("signed text is missing the windows zip")
	}
	// Change one checksum digit: the signature must no longer match.
	i := bytes.Index(sums, []byte("rclone-v1.75.2-windows-amd64.zip")) - 3
	tampered := append([]byte(nil), sums...)
	if tampered[i] == 'a' {
		tampered[i] = 'b'
	} else {
		tampered[i] = 'a'
	}
	if _, err := verifiedSums(tampered); err == nil {
		t.Fatal("tampered SHA256SUMS accepted")
	}
}

func TestIgnored(t *testing.T) {
	rules := []string{".obsidian/workspace*.json", "*.tmp", ".git/**"}
	for rel, want := range map[string]bool{
		".obsidian/workspace.json":        true,
		".obsidian/workspace-mobile.json": true,
		".obsidian/app.json":              false,
		"notas/rascunho.tmp":              true,
		".git/objects/ab/cd":              true,
		"projeto/.git/HEAD":               true,
		"notas/ideias.md":                 false,
	} {
		if got := ignored(rel, rules); got != want {
			t.Errorf("ignored(%q) = %v, want %v", rel, got, want)
		}
	}
}

func TestValidate(t *testing.T) {
	ok := Automation{ID: "a", Nome: "x", Origem: "/home/u/notas", Destino: "drive:notas", Modo: "copy", AoMudar: true, Ativa: true}
	if err := validate([]Automation{ok}); err != nil {
		t.Fatalf("valid automation rejected: %v", err)
	}
	bad := []Automation{
		{ID: "b", Nome: "x", Origem: "drive:a", Destino: "/tmp/b", Modo: "copy", AoMudar: true},
		{ID: "c", Nome: "x", Origem: "/a", Destino: "/b", Modo: "copy"},
		{ID: "d", Nome: "x", Origem: "/a", Destino: "/b", Modo: "move", IntervaloMin: 60},
		{ID: "e", Nome: "x", Origem: "/a", Destino: "/b", Modo: "copy", IntervaloMin: 2},
		{ID: "f", Nome: "x", Origem: "/a", Destino: "/a", Modo: "copy", IntervaloMin: 60},
		{ID: "g", Nome: "x", Origem: "/a", Destino: "drive:b", Modo: "bisync", IntervaloMin: 60, Historico: true},
	}
	for _, b := range bad {
		if err := validate([]Automation{b}); err == nil {
			t.Errorf("invalid automation %q accepted", b.ID)
		}
	}
}

func TestBisync(t *testing.T) {
	x := Automation{ID: "a", Nome: "x", Origem: "/home/u/notas", Destino: "drive:notas", Modo: "bisync", AoMudar: true, IntervaloMin: 15}
	if err := validate([]Automation{x}); err != nil {
		t.Fatalf("valid bisync automation rejected: %v", err)
	}
	p := bisyncParams(x, false)
	if p["path1"] != x.Origem || p["path2"] != x.Destino || p["resync"] != nil {
		t.Errorf("unexpected params: %v", p)
	}
	if p := bisyncParams(x, true); p["resync"] != true || p["resyncMode"] != "newer" {
		t.Errorf("resync params missing: %v", p)
	}
	y := x
	y.Ignorar = []string{"*.tmp"}
	if bisyncPair(x) == bisyncPair(y) {
		t.Error("changing the ignore rules must require a new resync")
	}
	if !needsResync("loopback: call failed: bisync aborted") || needsResync("rate limit") {
		t.Error("needsResync misclassified")
	}
}

func TestHistoryRoot(t *testing.T) {
	for dst, want := range map[string]string{
		"drive:Saves":        "drive:Saves-historico",
		"drive:jogos/saves/": "drive:jogos/saves-historico",
		"/home/u/backup":     "/home/u/backup-historico",
		"C:/Users/u/Saves":   "C:/Users/u/Saves-historico",
		`C:\Users\u\Saves`:   "C:/Users/u/Saves-historico",
	} {
		got, err := historyRoot(dst)
		if err != nil || got != want {
			t.Errorf("historyRoot(%q) = %q, %v; want %q", dst, got, err, want)
		}
	}
	for _, dst := range []string{"drive:", "drive:/", "C:", "C:/", ""} {
		if _, err := historyRoot(dst); err == nil {
			t.Errorf("historyRoot(%q) should fail (root has no sibling)", dst)
		}
	}
}

func TestExpiredDays(t *testing.T) {
	now := time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC)
	got := expiredDays([]string{"2026-10-21", "2026-09-22", "2026-09-21", "2025-01-01", "lixo", "2026-13-40"}, now, 30)
	want := map[string]bool{"2026-09-21": true, "2025-01-01": true}
	if len(got) != len(want) {
		t.Fatalf("expired = %v, want %v", got, want)
	}
	for _, n := range got {
		if !want[n] {
			t.Errorf("unexpected expired folder %q", n)
		}
	}
}

func TestValidateHistory(t *testing.T) {
	base := Automation{ID: "h", Nome: "x", Origem: "/a", Destino: "drive:Saves", Modo: "copy", IntervaloMin: 60, Historico: true, HistoricoDias: 30}
	if err := validate([]Automation{base}); err != nil {
		t.Fatalf("valid history rejected: %v", err)
	}
	root := base
	root.Destino = "drive:"
	if err := validate([]Automation{root}); err == nil {
		t.Error("history with a root destination accepted")
	}
	off := root
	off.Historico = false
	if err := validate([]Automation{off}); err != nil {
		t.Errorf("root destination without history rejected: %v", err)
	}
}

func TestTailLines(t *testing.T) {
	dir := t.TempDir()
	p := dir + "/x.log"
	if err := os.WriteFile(p, []byte("a\nb\nc\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	lines, next, err := tailLines(p, -1, 2)
	if err != nil || strings.Join(lines, ",") != "b,c" || next != 6 {
		t.Fatalf("tail = %v, %d, %v", lines, next, err)
	}
	f, _ := os.OpenFile(p, os.O_APPEND|os.O_WRONLY, 0o600)
	f.WriteString("d\ne\n")
	f.Close()
	lines, next, _ = tailLines(p, next, 100)
	if strings.Join(lines, ",") != "d,e" || next != 10 {
		t.Fatalf("incremental = %v, %d", lines, next)
	}
	// The file was rotated (smaller than the offset): start over.
	os.WriteFile(p, []byte("novo\n"), 0o600)
	lines, _, _ = tailLines(p, 999, 100)
	if strings.Join(lines, ",") != "novo" {
		t.Fatalf("after rotation = %v", lines)
	}
	if lines, _, err := tailLines(dir+"/nao-existe.log", -1, 5); err != nil || len(lines) != 0 {
		t.Fatalf("missing file = %v, %v", lines, err)
	}
}

func TestRotatingFile(t *testing.T) {
	p := t.TempDir() + "/r.log"
	r, err := openRotating(p)
	if err != nil {
		t.Fatal(err)
	}
	chunk := bytes.Repeat([]byte("x"), 1<<20)
	for i := 0; i < 7; i++ {
		if _, err := r.Write(chunk); err != nil {
			t.Fatal(err)
		}
	}
	st, _ := os.Stat(p)
	if st.Size() > maxLogSize {
		t.Errorf("log grew past the limit: %d", st.Size())
	}
	if _, err := os.Stat(p + ".1"); err != nil {
		t.Errorf("rotated copy missing: %v", err)
	}
}

func TestNewerVersion(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want bool
	}{
		{"1.1.0", "1.0.0", true},
		{"1.0.10", "1.0.9", true},
		{"2.0.0", "1.9.9", true},
		{"1.0.0", "1.0.0", false},
		{"1.0.0", "1.1.0", false},
	} {
		if got := newerVersion(c.a, c.b); got != c.want {
			t.Errorf("newerVersion(%q, %q) = %v", c.a, c.b, got)
		}
	}
}

func TestAjustes(t *testing.T) {
	if c := (Ajustes{}).config(); len(c) != 0 {
		t.Fatalf("empty override should change nothing, got %v", c)
	}
	c := Ajustes{Transfers: 2, Ordem: "size,ascending"}.config()
	if c["Transfers"] != 2 || c["OrderBy"] != "size,ascending" || c["Checkers"] != nil {
		t.Fatalf("unexpected config %v", c)
	}
	for _, bad := range []Ajustes{{Transfers: -1}, {Checkers: 65}, {Ordem: "size"}} {
		if bad.validate() == nil {
			t.Errorf("%+v accepted", bad)
		}
	}
}
