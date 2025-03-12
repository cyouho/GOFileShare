let currentPath = "";
let offset = 0;
const limit = 50;
let hasMore = true;

function formatSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    const value = bytes / Math.pow(k, i);
    return value < 10 ? value.toFixed(1) : Math.round(value) + " " + sizes[i];
}

function updateBreadcrumb(path) {
    const breadcrumb = document.getElementById("breadcrumb");
    if (!breadcrumb) {
        console.error("Breadcrumb element not found");
        return;
    }
    breadcrumb.innerHTML = "";

    // 规范化路径：替换反斜杠为正斜杠，并移除多余斜杠
    path = path ? path.replace(/\\/g, "/").replace(/\/+/g, "/") : "";

    // 添加根目录链接
    const rootLink = document.createElement("a");
    rootLink.href = "#";
    rootLink.textContent = "根目录";
    rootLink.onclick = (e) => {
        e.preventDefault();
        if (window.location.pathname === "/shared") {
            loadSharedDisks("");
        } else {
            loadDirectory("");
        }
    };
    breadcrumb.appendChild(rootLink);

    // 如果路径为空，在共享页面显示“所有共享文件夹”
    if (!path) {
        if (window.location.pathname === "/shared") {
            breadcrumb.appendChild(document.createTextNode(" > "));
            const allShared = document.createElement("span");
            allShared.textContent = "所有共享文件夹";
            allShared.style.color = "#5f6368";
            breadcrumb.appendChild(allShared);
        }
        return;
    }

    // 分割路径，支持Windows和Unix
    let parts = [];
    if (path.match(/^[A-Za-z]:/)) {
        // Windows路径，如 C:/folder/subfolder
        parts = path.split("/").filter(p => p && p !== ".");
        if (parts[0].endsWith(":")) parts[0] += "/"; // 确保C:变为C:/
    } else {
        // Unix路径，如 /folder/subfolder
        parts = path.split("/").filter(p => p && p !== ".");
    }

    // 重构当前路径并生成链接
    let current = "";
    parts.forEach((part, index) => {
        if (index === 0 && part.match(/^[A-Za-z]:\/?$/)) {
            current = part; // 根磁盘，如 C:/
        } else {
            current = current ? `${current}/${part}` : part;
        }

        breadcrumb.appendChild(document.createTextNode(" > "));
        const link = document.createElement("a");
        link.href = "#";
        link.textContent = part;
        if (index === parts.length - 1) {
            link.style.pointerEvents = "none";
            link.style.color = "#5f6368";
        } else {
            const targetPath = current;
            link.onclick = (e) => {
                e.preventDefault();
                if (window.location.pathname === "/shared") {
                    loadSharedDisks(targetPath);
                } else {
                    loadDirectory(targetPath);
                }
            };
        }
        breadcrumb.appendChild(link);
    });
}

function loadOverview() {
    const storageOverview = document.getElementById("storageOverview");
    if (!storageOverview) {
        console.error("StorageOverview element not found");
        return;
    }
    fetch("/disks")
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            renderStorageOverview(data.disks, true);
        })
        .catch(error => console.error("Error loading disks:", error));
}

function loadSharedDisks(path) {
    const contentDiv = document.getElementById("content");
    const fileTableBody = document.getElementById("fileTableBody");
    if (!contentDiv || !fileTableBody) {
        console.error("Content or fileTableBody element not found");
        return;
    }

    currentPath = path || "";
    const url = currentPath ? `/api/shared?path=${encodeURIComponent(currentPath)}` : "/api/shared";
    fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            console.log("Shared files data:", data);
            if (!data.entries || data.entries.length === 0) {
                fileTableBody.innerHTML = "<tr><td colspan='5'>暂无共享文件</td></tr>";
            } else {
                renderItems(data.entries, false);
            }
            contentDiv.style.display = "block";
            if (document.getElementById("breadcrumb")) updateBreadcrumb(currentPath);
            hasMore = false;
        })
        .catch(error => console.error("Error loading shared files:", error));
}

function loadDirectory(path) {
    const contentDiv = document.getElementById("content");
    const diskList = document.getElementById("diskList");
    if (!contentDiv || !diskList) {
        console.error("Content or DiskList element not found");
        return;
    }

    currentPath = path || "";
    fetch(`/directory?path=${encodeURIComponent(currentPath)}&offset=${offset}&limit=${limit}`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (currentPath === "") {
                renderDiskList(data.entries);
                diskList.style.display = "block";
                contentDiv.style.display = "none";
            } else {
                renderItems(data.entries, false, offset > 0);
                diskList.style.display = "none";
                contentDiv.style.display = "block";
            }
            if (document.getElementById("breadcrumb")) updateBreadcrumb(currentPath);
            hasMore = offset + limit < data.total;
        })
        .catch(error => console.error("Error loading directory:", error));
}

function renderStorageOverview(disks, isDisks) {
    const storageOverview = document.getElementById("storageOverview");
    if (!storageOverview) return;
    storageOverview.innerHTML = "";
    if (!isDisks) return;

    disks.forEach((disk, index) => {
        const totalFormatted = formatSize(disk.total || 0);
        const usedFormatted = formatSize(disk.used || 0);
        const percentage = disk.total > 0 ? ((disk.used / disk.total) * 100).toFixed(0) : 0;
        let statusClass = "status-normal";
        let statusText = "运行正常";
        if (percentage > 90) {
            statusClass = "status-error";
            statusText = "容量不足";
        } else if (percentage > 70) {
            statusClass = "status-warning";
            statusText = "容量警告";
        }

        const card = document.createElement("div");
        card.className = "storage-card";
        card.innerHTML = `
            <h3><i class="fas fa-hdd"></i> ${disk.name}</h3>
            <div class="disk-info">
                <span>容量</span>
                <span>${totalFormatted}</span>
            </div>
            <div class="disk-info">
                <span>已用空间</span>
                <span>${usedFormatted} (${percentage}%)</span>
            </div>
            <div class="progress-bar">
                <div class="progress ${percentage > 90 ? "error" : percentage > 70 ? "warning" : ""}" style="width: ${percentage}%"></div>
            </div>
            <div class="disk-info">
                <span>状态</span>
                <span class="disk-status ${statusClass}">${statusText}</span>
            </div>
        `;
        storageOverview.appendChild(card);
    });
}

function renderDiskList(disks) {
    const diskTableBody = document.getElementById("diskTableBody");
    if (!diskTableBody) return;
    diskTableBody.innerHTML = "";
    if (disks.length === 0) return;

    disks.forEach(disk => {
        const totalFormatted = formatSize(disk.total || 0);
        const usedFormatted = formatSize(disk.used || 0);
        const percentage = disk.total > 0 ? ((disk.used / disk.total) * 100).toFixed(0) : 0;
        let statusText = "运行正常";
        if (percentage > 90) {
            statusText = "容量不足";
        } else if (percentage > 70) {
            statusText = "容量警告";
        }

        const row = document.createElement("tr");
        row.innerHTML = `
            <td class="disk-name"><i class="fas fa-hdd disk-icon"></i> ${disk.name}</td>
            <td>${totalFormatted}</td>
            <td>
                <div class="progress-bar">
                    <div class="progress ${percentage > 90 ? "error" : percentage > 70 ? "warning" : ""}" style="width: ${percentage}%"></div>
                </div>
                ${usedFormatted} (${percentage}%)
            </td>
            <td>${statusText}</td>
            <td>
                <i class="fas fa-lock action-btn ${disk.isShared ? "shared" : ""}" title="${disk.isShared ? "点击取消共享" : "点击共享"}" data-path="${disk.path}"></i>
            </td>
        `;
        diskTableBody.appendChild(row);

        const diskName = row.querySelector(".disk-name");
        const actionBtn = row.querySelector(".action-btn");
        if (diskName) {
            diskName.addEventListener("click", () => {
                loadDirectory(disk.path);
            });
        }
        if (actionBtn) {
            actionBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleShare(disk.path, !disk.isShared, e.target);
            });
        }
    });
}

function renderItems(items, isDisks, append = false) {
    const contentDiv = document.getElementById("content");
    const fileTableBody = document.getElementById("fileTableBody");
    if (!contentDiv || !fileTableBody) return;

    if (!append) fileTableBody.innerHTML = "";

    // 过滤只显示已共享的文件（仅在共享页面需要）
    const filteredItems = window.location.pathname === "/shared" ? items : items;

    if (filteredItems.length === 0 && window.location.pathname === "/shared") {
        fileTableBody.innerHTML = "<tr><td colspan='5'>暂无共享文件</td></tr>";
        return;
    }

    filteredItems.forEach(item => {
        const row = document.createElement("tr");
        row.setAttribute("data-type", item.isDir ? "folder" : "file");

        // 文件名
        const nameCell = document.createElement("td");
        nameCell.className = "file-name";
        const icon = item.isDir ? "fa-folder" : (item.mediaType === "image" ? "fa-file-image" : "fa-file");
        nameCell.innerHTML = `<i class="fas ${icon} file-icon"></i><span>${item.name}</span>`;
        row.appendChild(nameCell);

        // 大小
        const sizeCell = document.createElement("td");
        sizeCell.textContent = item.isDir ? "-" : formatSize(item.size);
        row.appendChild(sizeCell);

        // 修改日期
        const dateCell = document.createElement("td");
        dateCell.textContent = item.modTime ? item.modTime.slice(0, 19) : "-";
        row.appendChild(dateCell);

        // 类型
        const typeCell = document.createElement("td");
        typeCell.textContent = item.isDir ? "文件夹" : (item.mediaType || "文件");
        row.appendChild(typeCell);

        // 操作
        const actionCell = document.createElement("td");
        const actionBtn = document.createElement("i");
        actionBtn.className = `fas ${item.isShared ? "fa-share-alt" : "fa-lock"} action-btn ${item.isShared ? "shared" : ""}`;
        actionBtn.title = item.isShared ? "点击取消共享" : "点击共享";
        actionBtn.setAttribute("data-path", item.path);
        actionCell.appendChild(actionBtn);
        row.appendChild(actionCell);

        fileTableBody.appendChild(row);

        // 添加事件监听
        const fileName = row.querySelector(".file-name");
        const actionBtnElement = row.querySelector(".action-btn");
        if (fileName) {
            fileName.addEventListener("click", () => {
                if (item.isDir) {
                    if (window.location.pathname === "/shared") {
                        loadSharedDisks(item.path);
                    } else {
                        loadDirectory(item.path);
                    }
                } else if (item.mediaType) {
                    showMedia(item.path, item.mediaType);
                }
            });

            // 双击重命名
            const nameSpan = fileName.querySelector("span");
            nameSpan.addEventListener("dblclick", () => {
                const originalName = nameSpan.textContent;
                const input = document.createElement("input");
                input.value = originalName;
                nameSpan.replaceWith(input);
                input.focus();
                input.addEventListener("blur", () => {
                    const newName = input.value || originalName;
                    const span = document.createElement("span");
                    span.textContent = newName;
                    input.replaceWith(span);
                    // TODO: 调用后端 API 更新文件名
                });
                input.addEventListener("keypress", (e) => {
                    if (e.key === "Enter") input.blur();
                });
            });
        }
        if (actionBtnElement) {
            actionBtnElement.addEventListener("click", (e) => {
                e.stopPropagation();
                const isShared = actionBtnElement.classList.contains("shared");
                toggleShare(item.path, !isShared, actionBtnElement);
            });
        }
    });
}

function toggleShare(path, share, btn) {
    const url = share ? "/share" : "/unshare";
    fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path })
    })
        .then(response => response.json())
        .then(data => {
            if (data.message) {
                if (btn.tagName === "BUTTON") {
                    btn.textContent = share ? "取消" : "共享";
                    btn.className = `capsule-btn ${share ? "unshare" : "share"}`;
                } else if (btn.tagName === "I") {
                    btn.classList.toggle("shared");
                    btn.classList.replace(share ? "fa-lock" : "fa-share-alt", share ? "fa-share-alt" : "fa-lock");
                    btn.title = share ? "点击取消共享" : "点击共享";
                }
                // 刷新列表
                if (window.location.pathname === "/shared") {
                    // 取消共享后，返回到根路径（因为条目可能被移除）
                    loadSharedDisks("");
                } else {
                    loadDirectory(currentPath);
                }
            } else {
                alert(data.error);
            }
        })
        .catch(error => console.error("Error toggling share:", error));
}

function showMedia(path, type) {
    const player = document.createElement("div");
    player.className = "media-player";
    player.innerHTML = `
        <span class="close-btn">×</span>
        ${type === "image" ? `<img src="/file?path=${encodeURIComponent(path)}">` :
          type === "video" ? `<video controls><source src="/file?path=${encodeURIComponent(path)}"></video>` :
          `<audio controls><source src="/file?path=${encodeURIComponent(path)}"></audio>`}
    `;
    document.body.appendChild(player);
    player.querySelector(".close-btn").onclick = () => player.remove();
}

window.onscroll = () => {
    if (hasMore && (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 100) {
        offset += limit;
        if (window.location.pathname === "/shared") {
            loadSharedDisks(currentPath);
        } else {
            loadDirectory(currentPath);
        }
    }
};

// 侧边栏切换
const sidebar = document.getElementById("sidebar");
const toggleBtn = document.getElementById("toggleBtn");
let isCollapsed = false;
if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
        isCollapsed = !isCollapsed;
        sidebar.classList.toggle("collapsed");
        toggleBtn.querySelector("i").className = `fas fa-chevron-${isCollapsed ? "right" : "left"}`;
    });
}

// 响应式调整
window.addEventListener("resize", () => {
    if (window.innerWidth < 768 && !isCollapsed) {
        sidebar.classList.add("collapsed");
        toggleBtn.querySelector("i").className = "fas fa-chevron-right";
        isCollapsed = true;
    }
});

// 深色模式切换并持久化
const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
    if (localStorage.getItem("darkMode") === "true") {
        document.body.classList.add("dark-mode");
        themeToggle.querySelector("i").className = "fas fa-moon";
    }

    themeToggle.addEventListener("click", () => {
        document.body.classList.toggle("dark-mode");
        const isDark = document.body.classList.contains("dark-mode");
        themeToggle.querySelector("i").className = isDark ? "fas fa-moon" : "fas fa-sun";
        localStorage.setItem("darkMode", isDark);
    });
}

// 刷新功能
const refreshBtn = document.getElementById("refreshBtn");
if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
        if (window.location.pathname === "/shared") {
            loadSharedDisks(currentPath);
        } else {
            loadDirectory(currentPath);
        }
    });
}

// 排序功能（磁盘表格）
const diskTableBody = document.getElementById("diskTableBody");
if (diskTableBody) {
    const headers = document.querySelectorAll("#diskTable th[data-sort]");
    headers.forEach(header => {
        header.addEventListener("click", () => {
            const sortKey = header.getAttribute("data-sort");
            const rows = Array.from(diskTableBody.getElementsByTagName("tr"));
            rows.sort((a, b) => {
                const aValue = a.querySelector(`td:nth-child(${sortKey === "name" ? 1 : sortKey === "capacity" ? 2 : 3})`).textContent;
                const bValue = b.querySelector(`td:nth-child(${sortKey === "name" ? 1 : sortKey === "capacity" ? 2 : 3})`).textContent;
                return sortKey === "used" ? parseUsed(bValue) - parseUsed(aValue) : sortKey === "capacity" ? parseCapacity(bValue) - parseCapacity(aValue) : bValue.localeCompare(aValue);
            });
            rows.forEach(row => diskTableBody.appendChild(row));
        });
    });
}

// 排序功能（文件表格）
document.addEventListener("DOMContentLoaded", () => {
    const fileTableBody = document.getElementById("fileTableBody");
    if (fileTableBody) {
        const headers = document.querySelectorAll("#fileTable th[data-sort]");
        headers.forEach(header => {
            header.addEventListener("click", () => {
                const sortKey = header.getAttribute("data-sort");
                const rows = Array.from(fileTableBody.getElementsByTagName("tr"));
                rows.sort((a, b) => {
                    const aType = a.getAttribute("data-type");
                    const bType = b.getAttribute("data-type");
                    if (aType !== bType) return aType === "folder" ? -1 : 1;

                    const aValue = a.querySelector(`td:nth-child(${sortKey === "name" ? 1 : sortKey === "size" ? 2 : 3})`).textContent;
                    const bValue = b.querySelector(`td:nth-child(${sortKey === "name" ? 1 : sortKey === "size" ? 2 : 3})`).textContent;
                    return sortKey === "size" ? parseSize(bValue) - parseSize(aValue) : bValue.localeCompare(aValue);
                });
                rows.forEach(row => fileTableBody.appendChild(row));
            });
        });
    }
});

function parseCapacity(capacity) {
    const [value, unit] = capacity.split(" ");
    const unitValue = unit === "TB" ? 1024 : unit === "GB" ? 1 : unit === "MB" ? 1 / 1024 : 0;
    return parseFloat(value) * unitValue;
}

function parseUsed(used) {
    const [value, ...rest] = used.split(" ");
    const unitPart = rest.join(" ").split("(")[0].trim();
    const unitValue = unitPart.includes("TB") ? 1024 : unitPart.includes("GB") ? 1 : unitPart.includes("MB") ? 1 / 1024 : 0;
    return parseFloat(value) * unitValue;
}

function parseSize(size) {
    if (size === "-") return 0;
    const [value, unit] = size.split(" ");
    return unit === "GB" ? parseFloat(value) * 1024 : unit === "MB" ? parseFloat(value) : unit === "KB" ? parseFloat(value) / 1024 : parseFloat(value) / 1024 / 1024;
}

// 初始化加载
document.addEventListener("DOMContentLoaded", () => {
    const path = window.location.pathname;
    console.log("Initializing for path:", path);
    if (path === "/") {
        loadOverview();
    } else if (path === "/myfiles") {
        loadDirectory("");
    } else if (path === "/shared") {
        loadSharedDisks("");
    }
});