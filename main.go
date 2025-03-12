package main

import (
	"GOFILESHARE/db"
	"GOFILESHARE/handlers"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

func main() {
	// 初始化数据库
	db.InitDB()

	// 初始化 Gin 并加载模板
	r := gin.Default()
	r.LoadHTMLGlob("templates/*")

	// 主页路由
	r.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "layout.html", gin.H{
			"Title": "概览",
			"Page":  "overview",
		})
	})
	// 我的文件页面
	r.GET("/myfiles", func(c *gin.Context) {
		c.HTML(http.StatusOK, "layout.html", gin.H{
			"Title": "我的文件",
			"Page":  "myfiles",
		})
	})
	// 共享文件页面
	r.GET("/shared", func(c *gin.Context) {
		c.HTML(http.StatusOK, "layout.html", gin.H{
			"Title": "共享文件",
			"Page":  "shared",
		})
	})

	// 移动端路由（保持不变）
	r.GET("/mobile", func(c *gin.Context) {
		c.File("./mobile.html")
	})

	// 提供静态文件
	r.Static("/static", "./static")

	// API 路由
	r.GET("/disks", handlers.GetDisks)
	r.GET("/shared-disks", handlers.GetSharedDisks)
	r.GET("/api/shared", handlers.GetShared) // 修改为 /api/shared
	r.GET("/directory", handlers.GetDirectory)
	r.GET("/file", handlers.GetFile)
	r.POST("/share", handlers.AddSharedFolder)
	r.POST("/unshare", handlers.RemoveSharedFolder)

	// 启动服务
	log.Println("Server starting on 0.0.0.0:8080")
	r.Run("0.0.0.0:8080")
}
