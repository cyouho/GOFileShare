//go:build windows

package handlers

import (
	"golang.org/x/sys/windows"
	"log"
)

func getDiskSpace(path string) (used, total uint64) {
	var freeBytes, totalBytes, totalFreeBytes uint64

	pathPtr, err := windows.UTF16PtrFromString(path)
	if err != nil {
		log.Printf("Failed to convert path to UTF16: %v", err)
		return 0, 0
	}

	err = windows.GetDiskFreeSpaceEx(
		pathPtr,
		&freeBytes,
		&totalBytes,
		&totalFreeBytes,
	)
	if err != nil {
		log.Printf("Failed to get disk space for %s: %v", path, err)
		return 0, 0
	}

	total = totalBytes
	used = totalBytes - freeBytes
	return used, total
}
