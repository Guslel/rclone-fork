package main

import (
	"os/exec"
	"syscall"
	"time"
)

func hideWindow(*exec.Cmd) {}

// killWithParent makes the kernel stop rclone if the app dies, so no
// rclone is left running with nobody able to talk to it.
func killWithParent(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Pdeathsig: syscall.SIGKILL}
}

// openBrowser waits for the opener to hand the address over: if the app
// exits first (second launch from the menu), the request is lost.
func openBrowser(url string) error {
	return runWithTimeout(exec.Command("xdg-open", url), 15*time.Second)
}

// showError is for fatal errors before the panel can open; the message also
// goes to the log and the terminal.
func showError(msg string) {
	if _, err := exec.LookPath("notify-send"); err == nil {
		_ = exec.Command("notify-send", "-u", "critical", "Painel do rclone", msg).Run()
	}
}
