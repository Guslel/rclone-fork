package main

import (
	"log"
	"os"
	"path/filepath"
	"sync"
)

// The app's log lines look like "2026/10/22 16:28:38 ERRO mensagem": the
// standard timestamp, then one of INFO, AVISO or ERRO. The Logs screen reads
// that level.

func logInfo(format string, args ...any)  { log.Printf("INFO "+format, args...) }
func logAviso(format string, args ...any) { log.Printf("AVISO "+format, args...) }
func logErro(format string, args ...any)  { log.Printf("ERRO "+format, args...) }

const maxLogSize = 5 << 20

// rotatingFile appends to a log file and, past maxLogSize, moves it to
// "<name>.1" (replacing the previous one) and starts a new file, so the
// log never grows without bound.
type rotatingFile struct {
	mu   sync.Mutex
	path string
	f    *os.File
	size int64
}

func openRotating(path string) (*rotatingFile, error) {
	r := &rotatingFile{path: path}
	return r, r.open()
}

func (r *rotatingFile) open() error {
	f, err := os.OpenFile(r.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return err
	}
	st, err := f.Stat()
	if err != nil {
		f.Close()
		return err
	}
	r.f, r.size = f, st.Size()
	return nil
}

func (r *rotatingFile) Write(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.size+int64(len(p)) > maxLogSize {
		r.f.Close()
		_ = os.Remove(r.path + ".1")
		_ = os.Rename(r.path, r.path+".1")
		if err := r.open(); err != nil {
			return 0, err
		}
	}
	n, err := r.f.Write(p)
	r.size += int64(n)
	return n, err
}

// logFiles maps the names the Logs screen may ask for to files in dir. It is
// a fixed list on purpose: the screen never chooses a path.
func logFiles(dir string) map[string]string {
	return map[string]string{
		"painel": filepath.Join(dir, "painel.log"),
		"rclone": filepath.Join(dir, "rclone.log"),
	}
}

// tailLines reads a log from byte offset `since`. With since < 0 it returns
// the last `max` lines; if the file shrank (it was rotated) it starts over
// from the end. It returns the lines and the new offset to ask from next time.
func tailLines(path string, since int64, max int) ([]string, int64, error) {
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, 0, nil
		}
		return nil, 0, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return nil, 0, err
	}
	size := st.Size()
	if since >= 0 && since <= size {
		// Incremental read, capped so one request stays small.
		const limit = 1 << 20
		start := since
		if size-start > limit {
			start = size - limit
		}
		buf := make([]byte, size-start)
		if _, err := f.ReadAt(buf, start); err != nil && size-start > 0 {
			return nil, 0, err
		}
		return splitLines(string(buf), start > since), size, nil
	}
	// First load, or the file was rotated: the last chunk of the file.
	const chunk = 512 << 10
	start := int64(0)
	if size > chunk {
		start = size - chunk
	}
	buf := make([]byte, size-start)
	if _, err := f.ReadAt(buf, start); err != nil && size-start > 0 {
		return nil, 0, err
	}
	lines := splitLines(string(buf), start > 0)
	if len(lines) > max {
		lines = lines[len(lines)-max:]
	}
	return lines, size, nil
}

// splitLines splits text into lines; dropFirst discards a first line that
// was cut in half by starting to read in the middle of the file.
func splitLines(s string, dropFirst bool) []string {
	out := []string{}
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			out = append(out, trimCR(s[start:i]))
			start = i + 1
		}
	}
	if start < len(s) {
		out = append(out, trimCR(s[start:]))
	}
	if dropFirst && len(out) > 0 {
		out = out[1:]
	}
	return out
}

func trimCR(s string) string {
	if n := len(s); n > 0 && s[n-1] == '\r' {
		return s[:n-1]
	}
	return s
}
