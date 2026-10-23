package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"runtime"
	"strings"
	"time"

	"github.com/ProtonMail/go-crypto/openpgp"
	"github.com/ProtonMail/go-crypto/openpgp/clearsign"
)

// rclone's release signing key, pinned by fingerprint. This is the minimal
// export rclone itself embeds for `rclone selfupdate` (cmd/selfupdate/verify.go);
// the full block from https://rclone.org/KEYS carries extra signatures that
// go-crypto cannot load.
//
//go:embed rclone-release-key.asc
var releaseKey string

const releaseKeyFingerprint = "FBF737ECE9F8AB18604BD2AC93935E02FF3B54FA"

const downloadsURL = "https://downloads.rclone.org"

// platform is rclone's name for this OS/architecture in release file names.
func platform() (string, error) {
	osName := map[string]string{"linux": "linux", "windows": "windows", "darwin": "osx"}[runtime.GOOS]
	arch := map[string]string{"amd64": "amd64", "arm64": "arm64", "386": "386", "arm": "arm"}[runtime.GOARCH]
	if osName == "" || arch == "" {
		return "", fmt.Errorf("sistema não suportado: %s/%s", runtime.GOOS, runtime.GOARCH)
	}
	return osName + "-" + arch, nil
}

func httpGet(ctx context.Context, url string, limit int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: HTTP %d", url, resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, limit))
}

var versionRe = regexp.MustCompile(`^v\d+\.\d+\.\d+$`)

// downloadRclone installs the latest stable rclone at dest. The release's
// SHA256SUMS must carry a valid signature from the pinned release key, and the
// zip must match the signed checksum.
func downloadRclone(ctx context.Context, dest string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	plat, err := platform()
	if err != nil {
		return "", err
	}
	raw, err := httpGet(ctx, downloadsURL+"/version.txt", 1024)
	if err != nil {
		return "", fmt.Errorf("não foi possível descobrir a versão do rclone: %w", err)
	}
	version := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(string(raw)), "rclone "))
	if !versionRe.MatchString(version) {
		return "", fmt.Errorf("versão inesperada: %q", version)
	}

	base := fmt.Sprintf("%s/%s", downloadsURL, version)
	sums, err := httpGet(ctx, base+"/SHA256SUMS", 1<<20)
	if err != nil {
		return "", err
	}
	signed, err := verifiedSums(sums)
	if err != nil {
		return "", err
	}
	zipName := fmt.Sprintf("rclone-%s-%s.zip", version, plat)
	want := ""
	for _, line := range strings.Split(string(signed), "\n") {
		f := strings.Fields(line)
		if len(f) == 2 && f[1] == zipName {
			want = strings.ToLower(f[0])
		}
	}
	if want == "" {
		return "", fmt.Errorf("%s não está na lista assinada", zipName)
	}

	data, err := httpGet(ctx, base+"/"+zipName, 300<<20)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != want {
		return "", errors.New("o arquivo baixado não confere com a assinatura do rclone")
	}

	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", err
	}
	member := fmt.Sprintf("rclone-%s-%s/rclone%s", version, plat, exeSuffix)
	for _, f := range zr.File {
		if f.Name != member {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return "", err
		}
		defer rc.Close()
		tmp := dest + ".novo"
		out, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
		if err != nil {
			return "", err
		}
		if _, err := io.Copy(out, io.LimitReader(rc, 300<<20)); err != nil {
			out.Close()
			return "", err
		}
		if err := out.Close(); err != nil {
			return "", err
		}
		return version, os.Rename(tmp, dest)
	}
	return "", fmt.Errorf("%s não encontrado dentro do zip", member)
}

// verifiedSums returns the signed part of a clearsigned SHA256SUMS, or an
// error unless it is signed by the pinned rclone release key.
func verifiedSums(clearsigned []byte) ([]byte, error) {
	block, _ := clearsign.Decode(clearsigned)
	if block == nil {
		return nil, errors.New("SHA256SUMS sem assinatura")
	}
	keyring, err := openpgp.ReadArmoredKeyRing(strings.NewReader(releaseKey))
	if err != nil {
		return nil, err
	}
	signer, err := openpgp.CheckDetachedSignature(keyring, bytes.NewReader(block.Bytes), block.ArmoredSignature.Body, nil)
	if err != nil {
		return nil, fmt.Errorf("assinatura do rclone inválida: %w", err)
	}
	if strings.ToUpper(hex.EncodeToString(signer.PrimaryKey.Fingerprint)) != releaseKeyFingerprint {
		return nil, errors.New("SHA256SUMS assinado por uma chave inesperada")
	}
	return block.Plaintext, nil
}
