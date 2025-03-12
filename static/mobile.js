document.addEventListener("DOMContentLoaded", () => {
    const contentDiv = document.getElementById("content");
    const breadcrumbsDiv = document.getElementById("breadcrumbs");
    const loadingDiv = document.getElementById("loading");
    const modal = document.getElementById("mediaModal");
    const mediaPreview = document.getElementById("mediaPreview");
    const closeModal = document.querySelector(".close");
    let currentPath = "";
    let offset = 0;
    const limit = 50;
    let loading = false;
    let hasMore = true;

    loadDisks();

    function loadDisks() {
        fetch("/shared-disks")
            .then(response => response.json())
            .then(data => {
                renderItems(data.disks, true);
                updateBreadcrumbs([]);
            })
            .catch(error => console.error("Error loading disks:", error));
    }

    function loadDirectory(path, append = false) {
        if (loading || !hasMore) return;
        loading = true;
        loadingDiv.style.display = "block";
        fetch(`/directory?path=${encodeURIComponent(path)}&offset=${offset}&limit=${limit}`)
            .then(response => response.json())
            .then(data => {
                console.log("Loaded directory data:", data);
                renderItems(data.entries, false, append);
                offset += data.entries.length;
                hasMore = offset < data.total;
                loading = false;
                loadingDiv.style.display = "none";
                if (!append) updateBreadcrumbs(path.split(/[/\\]+/).filter(Boolean));
                if (hasMore && contentDiv.scrollHeight <= contentDiv.clientHeight) {
                    loadDirectory(path, true);
                }
            })
            .catch(error => {
                console.error("Error loading directory:", error);
                loading = false;
                loadingDiv.style.display = "none";
            });
    }

    function renderItems(items, isDisks, append = false) {
        if (!append) contentDiv.innerHTML = "";
        items.forEach(item => {
            const div = document.createElement("div");
            div.className = `item ${item.isDir ? "directory" : "file"}`;
            let content = `<strong>${item.name}</strong>`;
            if (!isDisks && item.thumbnail) {
                content = `<img src="${item.thumbnail}" alt="${item.name}" onerror="console.error('Failed to load thumbnail for ${item.name}')"><br>${content}`;
                if (item.mediaType === "audio") div.classList.add("audio");
                else if (item.mediaType === "video") div.classList.add("video");
            }
            if (!isDisks) {
                content += item.isDir ? "" : `<span>大小: ${formatSize(item.size)}</span>`;
                content += `<span>修改时间: ${item.modTime.slice(0, 19)}</span>`;
            }
            div.innerHTML = content;

            div.onclick = () => {
                if (isDisks || item.isDir) {
                    currentPath = item.path;
                    offset = 0;
                    hasMore = true;
                    loadDirectory(currentPath);
                } else if (item.mediaType) {
                    showMedia(item.path, item.mediaType);
                }
            };
            contentDiv.appendChild(div);
        });
    }

    function showMedia(path, mediaType) {
        mediaPreview.innerHTML = "";
        if (mediaType === "audio") {
            const audio = document.createElement("audio");
            audio.src = `/file?path=${encodeURIComponent(path)}`;
            audio.controls = true;
            audio.autoplay = true;
            mediaPreview.appendChild(audio);
        } else if (mediaType === "video") {
            const video = document.createElement("video");
            video.src = `/file?path=${encodeURIComponent(path)}`;
            video.controls = true;
            video.autoplay = true;
            mediaPreview.appendChild(video);
        } else if (mediaType === "image") {
            const img = document.createElement("img");
            img.src = `/file?path=${encodeURIComponent(path)}`;
            mediaPreview.appendChild(img);
        }
        modal.style.display = "block";
    }

    closeModal.onclick = () => {
        modal.style.display = "none";
        mediaPreview.innerHTML = "";
    };

    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = "none";
            mediaPreview.innerHTML = "";
        }
    };

    function updateBreadcrumbs(parts) {
        breadcrumbsDiv.innerHTML = "";
        const homeLink = document.createElement("a");
        homeLink.href = "#";
        homeLink.textContent = "首页";
        homeLink.onclick = (e) => {
            e.preventDefault();
            currentPath = "";
            offset = 0;
            hasMore = true;
            loadDisks();
        };
        breadcrumbsDiv.appendChild(homeLink);

        // 获取当前路径
        let fullPath = currentPath || "";
        if (parts.length > 0) {
            let pathSoFar = "";
            parts.forEach((part, index) => {
                const separator = document.createTextNode(" > ");
                breadcrumbsDiv.appendChild(separator);

                if (index === 0 && part.match(/^[A-Z]:$/i)) {
                    pathSoFar = part + "\\";
                } else {
                    pathSoFar = pathSoFar === "" ? part : `${pathSoFar}${part}\\`;
                }

                const link = document.createElement("a");
                link.href = "#";
                link.textContent = part;
                // 只允许点击共享范围内的路径
                const isSharedPath = dbSharedFolders.some(shared => 
                    pathSoFar === shared || pathSoFar.startsWith(shared + "\\")
                );
                if (isSharedPath) {
                    link.dataset.path = pathSoFar;
                    link.onclick = (e) => {
                        e.preventDefault();
                        currentPath = link.dataset.path;
                        offset = 0;
                        hasMore = true;
                        loadDirectory(currentPath);
                    };
                } else {
                    link.style.pointerEvents = "none"; // 禁用点击
                    link.style.color = "#999"; // 灰色显示未共享路径
                }
                breadcrumbsDiv.appendChild(link);
            });
        }
    }

    // 动态获取 SharedFolders（模拟，后端可优化）
    let dbSharedFolders = [];
    fetch("/shared-disks")
        .then(response => response.json())
        .then(data => {
            dbSharedFolders = data.disks.map(folder => folder.path);
            console.log("Shared folders:", dbSharedFolders);
        })
        .catch(error => console.error("Error loading shared folders:", error));

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + " B";
        else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
        else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
        else return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    }

    contentDiv.addEventListener("scroll", () => {
        const scrollBottom = contentDiv.scrollTop + contentDiv.clientHeight;
        const triggerPoint = contentDiv.scrollHeight - 50;
        if (scrollBottom >= triggerPoint && hasMore && !loading) {
            loadDirectory(currentPath, true);
        }
    });

    window.addEventListener("resize", () => {
        if (hasMore && !loading && contentDiv.scrollHeight <= contentDiv.clientHeight) {
            loadDirectory(currentPath, true);
        }
    });
});