package db

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

var DB *sql.DB
var SharedFolders []string

func InitDB() {
	var err error
	dbPath := "./disk-explorer.db"
	DB, err = sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}

	_, err = DB.Exec(`
		CREATE TABLE IF NOT EXISTS shared_folders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			path TEXT UNIQUE
		)
	`)
	if err != nil {
		log.Fatalf("Failed to create table: %v", err)
	}

	LoadSharedFolders()
}

func LoadSharedFolders() {
	rows, err := DB.Query("SELECT path FROM shared_folders")
	if err != nil {
		log.Printf("Failed to load shared folders: %v", err)
		return
	}
	defer rows.Close()

	SharedFolders = []string{}
	for rows.Next() {
		var path string
		if err := rows.Scan(&path); err != nil {
			log.Printf("Failed to scan shared folder: %v", err)
			continue
		}
		if _, err := os.Stat(path); err == nil {
			SharedFolders = append(SharedFolders, filepath.Clean(path))
			log.Printf("Loaded shared folder: %s", path)
		}
	}
	log.Printf("Loaded %d shared folders", len(SharedFolders))
}

func AddSharedFolder(path string) error {
	cleanPath := filepath.Clean(path)
	if _, err := os.Stat(cleanPath); err != nil {
		log.Printf("Invalid path %s: %v", cleanPath, err)
		return err
	}

	_, err := DB.Exec("INSERT OR IGNORE INTO shared_folders (path) VALUES (?)", cleanPath)
	if err != nil {
		log.Printf("Failed to add shared folder %s to database: %v", cleanPath, err)
		return err
	}

	for _, p := range SharedFolders {
		if p == cleanPath {
			log.Printf("Folder %s already in SharedFolders", cleanPath)
			return nil
		}
	}
	SharedFolders = append(SharedFolders, cleanPath)
	log.Printf("Added shared folder: %s", cleanPath)
	return nil
}

func RemoveSharedFolder(path string) error {
	cleanPath := filepath.Clean(path)
	_, err := DB.Exec("DELETE FROM shared_folders WHERE path = ?", cleanPath)
	if err != nil {
		log.Printf("Failed to remove shared folder %s from database: %v", cleanPath, err)
		return err
	}

	for i, p := range SharedFolders {
		if p == cleanPath {
			SharedFolders = append(SharedFolders[:i], SharedFolders[i+1:]...)
			log.Printf("Removed shared folder: %s", cleanPath)
			break
		}
	}
	return nil
}
