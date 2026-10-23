package main

import (
	"os/exec"
	"time"
)

func hideWindow(*exec.Cmd) {}

func killWithParent(*exec.Cmd) {}

// openBrowser waits for the opener to hand the address over: if the app
// exits first (second launch from the menu), the request is lost.
func openBrowser(url string) error {
	return runWithTimeout(exec.Command("open", url), 15*time.Second)
}

func showError(string) {}
