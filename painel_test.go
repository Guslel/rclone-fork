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
	}
	for _, b := range bad {
		if err := validate([]Automation{b}); err == nil {
			t.Errorf("invalid automation %q accepted", b.ID)
		}
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
