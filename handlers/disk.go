package handlers

import (
	"GOFILESHARE/db"
	"GOFILESHARE/models"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/disintegration/imaging"
	"github.com/gabriel-vasile/mimetype"
	"github.com/gin-gonic/gin"
)

// GetDisks 返回所有磁盘（Web 端使用）
func GetDisks(c *gin.Context) {
	var disks []models.Disk
	switch runtime.GOOS {
	case "windows":
		for drive := 'A'; drive <= 'Z'; drive++ {
			path := string(drive) + ":\\"
			if _, err := os.Stat(path); !os.IsNotExist(err) {
				used, total := getDiskSpace(path)
				disks = append(disks, models.Disk{
					Name:  string(drive) + ":",
					Path:  path,
					Used:  used,
					Total: total,
				})
			}
		}
	case "linux", "darwin":
		used, total := getDiskSpace("/")
		disks = append(disks, models.Disk{
			Name:  "Root",
			Path:  "/",
			Used:  used,
			Total: total,
		})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unsupported OS"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"disks": disks})
}

// GetSharedDisks 返回共享磁盘信息（用于概览页面）
func GetSharedDisks(c *gin.Context) {
	var disks []models.Disk
	if len(db.SharedFolders) == 0 {
		c.JSON(http.StatusOK, gin.H{"disks": disks})
		return
	}
	for _, path := range db.SharedFolders {
		info, err := os.Stat(path)
		if err != nil {
			log.Printf("Invalid shared folder %s: %v", path, err)
			continue
		}
		used, total := getDiskSpace(path)
		disks = append(disks, models.Disk{
			Name:  info.Name(),
			Path:  path,
			Used:  used,
			Total: total,
		})
	}
	c.JSON(http.StatusOK, gin.H{"disks": disks})
}

// GetShared 返回共享文件和文件夹（用于 /shared 页面）
func GetShared(c *gin.Context) {
	path := c.Query("path") // 支持路径参数
	limitStr := c.DefaultQuery("limit", "50")
	offsetStr := c.DefaultQuery("offset", "0")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 50
	}
	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		offset = 0
	}

	var allEntries []models.DirEntry

	// 如果 path 为空，显示所有共享条目本身
	if path == "" {
		for _, sharedPath := range db.SharedFolders {
			cleanPath := filepath.Clean(sharedPath)
			info, err := os.Stat(cleanPath)
			if err != nil {
				log.Printf("Failed to stat shared path %s: %v", cleanPath, err)
				continue
			}
			entry := models.NewDirEntry(info, filepath.Dir(cleanPath))
			entry.IsShared = true // 共享条目本身标记为已共享
			allEntries = append(allEntries, entry)
		}
	} else {
		// 如果 path 不为空，显示指定路径下的内容
		cleanPath := filepath.Clean(path)
		if !filepath.IsAbs(cleanPath) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid path: must be absolute"})
			return
		}

		// 验证路径是否在共享范围内
		isShared := false
		for _, shared := range db.SharedFolders {
			if cleanPath == shared || strings.HasPrefix(cleanPath, shared+string(filepath.Separator)) {
				isShared = true
				break
			}
		}
		if !isShared {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied: path not shared"})
			return
		}

		dir, err := os.Open(cleanPath)
		if err != nil {
			log.Printf("Failed to open shared directory %s: %v", cleanPath, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to open directory"})
			return
		}
		defer dir.Close()

		files, err := dir.Readdir(-1)
		if err != nil {
			log.Printf("Failed to read shared directory %s: %v", cleanPath, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to read directory"})
			return
		}

		for _, file := range files {
			entry := models.NewDirEntry(file, cleanPath)
			if !entry.IsDir {
				mime, err := mimetype.DetectFile(entry.Path)
				if err != nil {
					log.Printf("Failed to detect MIME for %s: %v", entry.Path, err)
					continue
				}
				if mime.Is("image/jpeg") || mime.Is("image/png") || mime.Is("image/webp") || mime.Is("image/gif") || mime.Is("image/bmp") {
					absPath := filepath.Clean(entry.Path)
					entry.Thumbnail = "/file?path=" + url.QueryEscape(absPath) + "&thumbnail=true"
					entry.MediaType = "image"
				}
				if mime.Is("video/mp4") || mime.Is("video/webm") || mime.Is("video/avi") || mime.Is("video/mov") || mime.Is("video/ogg") {
					entry.Thumbnail = "/static/icons/video-icon.png"
					entry.MediaType = "video"
				}
				if mime.Is("audio/mpeg") || mime.Is("audio/wav") || mime.Is("audio/ogg") || mime.Is("audio/aac") || mime.Is("audio/flac") {
					entry.Thumbnail = "/static/icons/audio-icon.png"
					entry.MediaType = "audio"
				}
			}
			// 检查是否是共享路径本身
			entry.IsShared = false
			for _, shared := range db.SharedFolders {
				sharedClean := filepath.Clean(shared)
				if entry.Path == sharedClean {
					entry.IsShared = true
					break
				}
			}
			allEntries = append(allEntries, entry)
		}
	}

	// 按文件夹优先、名称排序
	sort.Slice(allEntries, func(i, j int) bool {
		if allEntries[i].IsDir != allEntries[j].IsDir {
			return allEntries[i].IsDir
		}
		return allEntries[i].Name < allEntries[j].Name
	})

	total := len(allEntries)
	start := offset
	end := offset + limit
	if start >= total {
		c.JSON(http.StatusOK, gin.H{"entries": []models.DirEntry{}, "total": total})
		return
	}
	if end > total {
		end = total
	}

	c.JSON(http.StatusOK, gin.H{
		"entries": allEntries[start:end],
		"total":   total,
	})
}

func GetDirectory(c *gin.Context) {
	path := c.Query("path")
	limitStr := c.DefaultQuery("limit", "50")
	offsetStr := c.DefaultQuery("offset", "0")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 50
	}
	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		offset = 0
	}

	// 如果path为空，返回所有磁盘列表
	if path == "" {
		var disks []models.Disk
		switch runtime.GOOS {
		case "windows":
			for drive := 'A'; drive <= 'Z'; drive++ {
				path := string(drive) + ":\\"
				if _, err := os.Stat(path); !os.IsNotExist(err) {
					used, total := getDiskSpace(path)
					disks = append(disks, models.Disk{
						Name:  string(drive) + ":",
						Path:  path,
						Used:  used,
						Total: total,
					})
				}
			}
		case "linux", "darwin":
			used, total := getDiskSpace("/")
			disks = append(disks, models.Disk{
				Name:  "Root",
				Path:  "/",
				Used:  used,
				Total: total,
			})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Unsupported OS"})
			return
		}
		var entries []models.DirEntry
		for _, disk := range disks {
			entry := models.DirEntry{
				Name:    disk.Name,
				Path:    disk.Path,
				IsDir:   true,
				Size:    0,
				ModTime: time.Now().Format(time.RFC3339),
				Used:    disk.Used,
				Total:   disk.Total,
			}
			entries = append(entries, entry)
		}
		total := len(entries)
		start := offset
		end := offset + limit
		if start >= total {
			c.JSON(http.StatusOK, gin.H{"entries": []models.DirEntry{}, "total": total})
			return
		}
		if end > total {
			end = total
		}
		c.JSON(http.StatusOK, gin.H{
			"entries": entries[start:end],
			"total":   total,
		})
		return
	}

	// 验证和清理路径
	cleanPath := filepath.Clean(path)
	if !filepath.IsAbs(cleanPath) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid path: must be absolute"})
		return
	}
	log.Printf("GetDirectory called for path: %s, SharedFolders: %v", cleanPath, db.SharedFolders)

	isShared := len(db.SharedFolders) == 0
	for _, shared := range db.SharedFolders {
		if cleanPath == shared || strings.HasPrefix(cleanPath, shared+string(filepath.Separator)) {
			isShared = true
			break
		}
	}
	if c.Request.URL.Path != "/directory" && !isShared {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	dir, err := os.Open(cleanPath)
	if err != nil {
		log.Printf("Failed to open directory %s: %v", cleanPath, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to open directory"})
		return
	}
	defer dir.Close()

	files, err := dir.Readdir(-1)
	if err != nil {
		log.Printf("Failed to read directory %s: %v", cleanPath, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to read directory"})
		return
	}

	var entries []models.DirEntry
	for _, file := range files {
		entry := models.NewDirEntry(file, cleanPath)
		if !entry.IsDir {
			mime, err := mimetype.DetectFile(entry.Path)
			if err != nil {
				log.Printf("Failed to detect MIME for %s: %v", entry.Path, err)
				continue
			}
			if mime.Is("image/jpeg") || mime.Is("image/png") || mime.Is("image/webp") || mime.Is("image/gif") || mime.Is("image/bmp") {
				absPath := filepath.Clean(entry.Path)
				entry.Thumbnail = "/file?path=" + url.QueryEscape(absPath) + "&thumbnail=true"
				entry.MediaType = "image"
			}
			if mime.Is("video/mp4") || mime.Is("video/webm") || mime.Is("video/avi") || mime.Is("video/mov") || mime.Is("video/ogg") {
				entry.Thumbnail = "/static/icons/video-icon.png"
				entry.MediaType = "video"
			}
			if mime.Is("audio/mpeg") || mime.Is("audio/wav") || mime.Is("audio/ogg") || mime.Is("audio/aac") || mime.Is("audio/flac") {
				entry.Thumbnail = "/static/icons/audio-icon.png"
				entry.MediaType = "audio"
			}
		}
		entry.IsShared = false
		for _, shared := range db.SharedFolders {
			sharedClean := filepath.Clean(shared)
			if entry.Path == sharedClean {
				entry.IsShared = true
				log.Printf("Matched: entry.Path=%s, shared=%s, isShared=true", entry.Path, sharedClean)
				break
			}
		}
		entries = append(entries, entry)
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].IsDir != entries[j].IsDir {
			return entries[i].IsDir
		}
		return entries[i].Name < entries[j].Name
	})

	total := len(entries)
	start := offset
	end := offset + limit
	if start >= total {
		c.JSON(http.StatusOK, gin.H{"entries": []models.DirEntry{}, "total": total})
		return
	}
	if end > total {
		end = total
	}

	c.JSON(http.StatusOK, gin.H{
		"entries": entries[start:end],
		"total":   total,
	})
}

func GetFile(c *gin.Context) {
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Path is required"})
		return
	}
	decodedPath, err := url.QueryUnescape(path)
	if err != nil {
		log.Printf("Failed to decode path %s: %v", path, err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid path"})
		return
	}
	cleanPath := filepath.Clean(decodedPath)

	isShared := len(db.SharedFolders) == 0
	for _, shared := range db.SharedFolders {
		if cleanPath == shared || strings.HasPrefix(cleanPath, shared+string(filepath.Separator)) {
			isShared = true
			break
		}
	}
	if !isShared {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	file, err := os.Open(cleanPath)
	if err != nil {
		log.Printf("Failed to open file %s: %v", cleanPath, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to open file"})
		return
	}
	defer file.Close()

	fileInfo, err := file.Stat()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to get file info"})
		return
	}
	fileSize := fileInfo.Size()

	mime, err := mimetype.DetectFile(cleanPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to detect mime type"})
		return
	}

	thumbnail := c.Query("thumbnail") == "true"
	if thumbnail {
		if mime.Is("image/jpeg") || mime.Is("image/png") || mime.Is("image/webp") || mime.Is("image/gif") {
			img, err := imaging.Open(cleanPath)
			if err != nil {
				log.Printf("Failed to open image %s: %v", cleanPath, err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to process image"})
				return
			}
			thumb := imaging.Thumbnail(img, 100, 100, imaging.Lanczos)
			c.Header("Content-Type", "image/jpeg")
			err = imaging.Encode(c.Writer, thumb, imaging.JPEG)
			if err != nil {
				log.Printf("Failed to encode thumbnail for %s: %v", cleanPath, err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to encode thumbnail"})
				return
			}
			return
		}
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "Thumbnail generation not supported for this format"})
		return
	}

	c.Header("Accept-Ranges", "bytes")
	rangeHeader := c.Request.Header.Get("Range")
	if rangeHeader == "" {
		c.Header("Content-Length", strconv.FormatInt(fileSize, 10))
		c.Header("Content-Type", mime.String())
		io.Copy(c.Writer, file)
		return
	}

	rangeParts := strings.Split(strings.TrimPrefix(rangeHeader, "bytes="), "-")
	if len(rangeParts) != 2 {
		c.Status(http.StatusRequestedRangeNotSatisfiable)
		return
	}

	start, err := strconv.ParseInt(rangeParts[0], 10, 64)
	if err != nil {
		c.Status(http.StatusRequestedRangeNotSatisfiable)
		return
	}
	end := fileSize - 1
	if rangeParts[1] != "" {
		end, err = strconv.ParseInt(rangeParts[1], 10, 64)
		if err != nil || end >= fileSize {
			end = fileSize - 1
		}
	}

	if start > end || start >= fileSize {
		c.Status(http.StatusRequestedRangeNotSatisfiable)
		return
	}

	_, err = file.Seek(start, io.SeekStart)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to seek file"})
		return
	}

	c.Header("Content-Type", mime.String())
	c.Header("Content-Length", strconv.FormatInt(end-start+1, 10))
	c.Header("Content-Range", "bytes "+strconv.FormatInt(start, 10)+"-"+strconv.FormatInt(end, 10)+"/"+strconv.FormatInt(fileSize, 10))
	c.Status(http.StatusPartialContent)
	io.CopyN(c.Writer, file, end-start+1)
}

func AddSharedFolder(c *gin.Context) {
	var req struct {
		Path string `json:"path"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if err := db.AddSharedFolder(req.Path); err != nil {
		log.Printf("AddSharedFolder failed for %s: %v", req.Path, err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid or inaccessible path"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Folder shared successfully"})
}

func RemoveSharedFolder(c *gin.Context) {
	var req struct {
		Path string `json:"path"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if err := db.RemoveSharedFolder(req.Path); err != nil {
		log.Printf("RemoveSharedFolder failed for %s: %v", req.Path, err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to remove shared folder"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Folder unshared successfully"})
}
