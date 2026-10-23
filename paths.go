package main

import (
	"os"
	"path/filepath"
	"runtime"
)

// exeSuffix is ".exe" on Windows.
var exeSuffix = map[bool]string{true: ".exe", false: ""}[runtime.GOOS == "windows"]

// appDir is the per-user folder for the app's own files: its copy of rclone,
// the automations, the login secret and the log. Accounts stay in rclone's
// usual config file, shared with the rclone command.
func appDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(base, "rclone-painel")
	if err := os.MkdirAll(filepath.Join(dir, "bin"), 0o700); err != nil {
		return "", err
	}
	return dir, nil
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}
