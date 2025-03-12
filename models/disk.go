package models

import (
	"os"
	"path/filepath"
	"time"
)

// Disk 表示磁盘信息
type Disk struct {
	Name  string `json:"name"`  // 磁盘名称（如 "C:" 或 "/dev/sda"）
	Path  string `json:"path"`  // 磁盘路径
	Used  uint64 `json:"used"`  // 已使用空间（字节）
	Total uint64 `json:"total"` // 总空间（字节）
}

// DirEntry 表示目录中的条目（文件或文件夹）
type DirEntry struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	IsDir     bool   `json:"isDir"`
	Size      int64  `json:"size,omitempty"`      // 文件大小（仅文件）
	ModTime   string `json:"modTime"`             // 修改时间
	Thumbnail string `json:"thumbnail,omitempty"` // 新增缩略图 URL
	MediaType string `json:"mediaType,omitempty"` // 新增媒体类型
	IsShared  bool   `json:"isShared,omitempty"`  // 新增共享状态
	Used      uint64 `json:"used,omitempty"`      // 新增：已用空间
	Total     uint64 `json:"total,omitempty"`     // 新增：总容量
}

// 获取文件信息并转换为 DirEntry
func NewDirEntry(f os.FileInfo, parentPath string) DirEntry {
	// 使用 filepath.Join 确保路径格式一致
	path := filepath.Join(parentPath, f.Name())
	return DirEntry{
		Name:    f.Name(),
		Path:    filepath.Clean(path), // 统一清理路径
		IsDir:   f.IsDir(),
		Size:    f.Size(),
		ModTime: f.ModTime().Format(time.RFC3339), // 格式化为 RFC3339
	}
}
