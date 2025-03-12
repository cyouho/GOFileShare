// +build !windows
//go:build !windows

package handlers

import (
	"log"

	"golang.org/x/sys/unix"
)

func getDiskSpace(path string) (used, total uint64) {
	var stat unix.Statfs_t
	err := unix.Statfs(path, &stat)
	if err != nil {
		log.Printf("Failed to get disk space for %s: %v", path, err)
		return 0, 0
	}
	total = stat.Blocks * uint64(stat.Bsize)
	free := stat.Bfree * uint64(stat.Bsize)
	used = total - free
	return used, total
}
