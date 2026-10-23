package main

import (
	"os/exec"
	"syscall"
	"time"
	"unsafe"
)

const createNoWindow = 0x08000000

// hideWindow keeps rclone from opening a console window.
func hideWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
	cmd.SysProcAttr.CreationFlags |= createNoWindow
}

// Windows has no parent-death signal; the app stops rclone on exit and the
// single-instance check keeps a second copy from starting.
func killWithParent(*exec.Cmd) {}

// openBrowser waits for the opener to hand the address over: if the app
// exits first (second launch), the request could be lost.
func openBrowser(url string) error {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	hideWindow(cmd)
	return runWithTimeout(cmd, 15*time.Second)
}

// showError shows a message box: the Windows build has no console, so this
// is the only way the user sees why the app could not start.
func showError(msg string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	box := user32.NewProc("MessageBoxW")
	text, _ := syscall.UTF16PtrFromString(msg)
	title, _ := syscall.UTF16PtrFromString("Painel do rclone")
	const mbIconError = 0x10
	_, _, _ = box.Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), mbIconError)
}
