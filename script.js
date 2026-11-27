const uploadForm = document.querySelector("#upload-form");
const libraryContent = document.querySelector("#library-content");
const itemCount = document.querySelector("#item-count");
const formMessage = document.querySelector("#form-message");
const librarySearch = document.querySelector("#library-search");
const uploaderInput = document.querySelector("#uploader");
const uploaderCharacterCount = document.querySelector("#uploader-character-count");
const previewDialog = document.querySelector("#file-preview-dialog");
const previewTitle = document.querySelector("#preview-title");
const previewContent = document.querySelector("#preview-content");
const previewFileName = document.querySelector("#preview-file-name");
const previewDownload = document.querySelector("#preview-download");
const uploadProgress = document.querySelector("#upload-progress");
const fileProgress = document.querySelector("#file-progress");
const progressMessage = document.querySelector("#progress-message");
const progressPercent = document.querySelector("#progress-percent");
const categoryPicker = document.querySelector("#category-picker");
const categorySelect = document.querySelector("#category");
const categoryTrigger = document.querySelector("#category-trigger");
const categoryValue = document.querySelector("#category-value");
const categoryOptions = document.querySelector("#category-options");
const libraryFilters = document.querySelectorAll(".library-filter");
const maxFileSize = 100 * 1024 * 1024;
const maxUploaderCharacters = 14;
const maxTitleCharacters = 20;
let previewRequestId = 0;
let activePreviewId = null;
let activeLibraryCategory = "all";
let uploadProgressTimeout = null;
const uploads = [];

initializeAnimations();
initializeSmoothScroll();
initializeCategoryDropdown();
uploaderInput.addEventListener("input", updateUploaderCharacterCount);
updateUploaderCharacterCount();
librarySearch.addEventListener("input", renderLibrary);
libraryFilters.forEach((filter) => {
    filter.addEventListener("click", () => {
        activeLibraryCategory = filter.dataset.category;
        libraryFilters.forEach((button) => {
            const isActive = button === filter;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        });
        renderLibrary();
    });
});
document.querySelector("#close-preview").addEventListener("click", () => previewDialog.close());
previewDialog.addEventListener("click", (event) => {
    if (event.target === previewDialog) {
        previewDialog.close();
    }
});
previewDialog.addEventListener("close", () => {
    previewRequestId += 1;
    activePreviewId = null;
    previewContent.replaceChildren();
});

uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(uploadForm);
    const file = formData.get("file");
    const uploader = formData.get("uploader").trim();
    const title = formData.get("title").trim();

    if (file instanceof File && file.size > maxFileSize) {
        formMessage.textContent = "This file is larger than 100 MB. Choose a smaller file.";
        return;
    }

    if (!(file instanceof File) || file.size === 0 || !uploader || !title) {
        formMessage.textContent = "Add your name, a title, and a file first.";
        return;
    }

    if (countCharacters(title) > maxTitleCharacters) {
        formMessage.textContent = `The title can be no more than ${maxTitleCharacters} characters.`;
        return;
    }

    if (countCharacters(uploader) > maxUploaderCharacters) {
        uploaderInput.setAttribute("aria-invalid", "true");
        formMessage.textContent = `Your name can be no more than ${maxUploaderCharacters} characters.`;
        uploaderInput.focus();
        return;
    }

    const normalizedUploader = normalizeName(uploader);
    const normalizedFileName = normalizeName(file.name);
    const normalizedTitle = normalizeName(title);
    if (normalizedUploader === normalizedFileName || normalizedUploader === normalizedTitle) {
        formMessage.textContent = "Your name must be different from the file name and title.";
        return;
    }

    const submitButton = uploadForm.querySelector(".submit-button");
    if (uploadProgressTimeout !== null) {
        window.clearTimeout(uploadProgressTimeout);
        uploadProgressTimeout = null;
    }
    submitButton.disabled = true;
    formMessage.textContent = "";
    updateProgress(0, "Preparing file in this browser…");
    uploadProgress.hidden = false;

    try {
        await prepareFileLocally(file);

        uploads.push({
            id: `${Date.now()}-${Math.random()}`,
            uploader,
            category: formData.get("category"),
            title,
            file,
            uploadedAt: new Date(),
            url: URL.createObjectURL(file)
        });

        renderLibrary();
        formMessage.textContent = "Ready in this browser tab.";
        uploadForm.reset();
        updateUploaderCharacterCount();
        uploadProgressTimeout = window.setTimeout(() => {
            uploadProgress.hidden = true;
            uploadProgressTimeout = null;
        }, 30000);
    } catch (error) {
        console.error("Could not prepare the selected file locally.", error);
        formMessage.textContent = "Could not read this file. Please select it again and retry.";
    } finally {
        submitButton.disabled = false;
    }
});

async function prepareFileLocally(file) {
    const chunkSize = 256 * 1024;
    let bytesRead = 0;

    while (bytesRead < file.size) {
        const end = Math.min(bytesRead + chunkSize, file.size);
        await file.slice(bytesRead, end).arrayBuffer();
        bytesRead = end;
        const percent = Math.floor((bytesRead / file.size) * 100);
        updateProgress(percent, "Preparing file in this browser…");
    }

    updateProgress(100, "Ready in this browser (not uploaded online)");
}

function updateProgress(percent, message) {
    fileProgress.value = percent;
    progressPercent.textContent = `${percent}%`;
    progressMessage.textContent = message;
}

function updateUploaderCharacterCount() {
    const characterCount = countCharacters(uploaderInput.value);
    uploaderCharacterCount.textContent = `${characterCount} / ${maxUploaderCharacters} characters (maximum)`;
    uploaderInput.setAttribute("aria-invalid", String(characterCount > maxUploaderCharacters));
}

function countCharacters(value) {
    return Array.from(value).length;
}

function renderLibrary() {
    const query = librarySearch.value.trim().toLocaleLowerCase();
    const matchingUploads = uploads.filter((upload) => {
        const searchableText = `${upload.uploader} ${upload.title} ${upload.file.name} ${upload.category}`;
        const matchesCategory = activeLibraryCategory === "all" || upload.category === activeLibraryCategory;
        return matchesCategory && searchableText.toLocaleLowerCase().includes(query);
    });

    if (uploads.length === 0) {
        itemCount.textContent = "0 files";
        libraryContent.replaceChildren(createEmptyState());
        return;
    }

    itemCount.textContent = query || activeLibraryCategory !== "all"
        ? `Showing ${matchingUploads.length} of ${uploads.length}`
        : `${uploads.length} ${uploads.length === 1 ? "file" : "files"}`;

    if (matchingUploads.length === 0) {
        libraryContent.replaceChildren(createNoResultsState());
        return;
    }

    const folders = new Map();
    matchingUploads.forEach((upload) => {
        const key = upload.uploader.trim().toLocaleLowerCase();
        if (!folders.has(key)) {
            folders.set(key, { name: upload.uploader, items: [] });
        }
        folders.get(key).items.push(upload);
    });

    const fragment = document.createDocumentFragment();
    folders.forEach((folder) => fragment.append(createFolder(folder)));
    libraryContent.replaceChildren(fragment);
    animateFileFolders();
}

function initializeAnimations() {
    if (!window.gsap || !window.ScrollTrigger || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
    }

    gsap.registerPlugin(ScrollTrigger);

    gsap.from(".site-header", {
        y: -18,
        autoAlpha: 0,
        duration: 0.6,
        ease: "power2.out"
    });

    gsap.from(".hero > :not(.hero-decoration)", {
        y: 22,
        autoAlpha: 0,
        duration: 0.7,
        stagger: 0.12,
        delay: 0.12,
        ease: "power2.out"
    });

    gsap.from(".hero-decoration .decoration-card", {
        y: 20,
        autoAlpha: 0,
        rotate: 0,
        duration: 0.7,
        stagger: 0.1,
        delay: 0.25,
        ease: "back.out(1.5)"
    });

    gsap.from(".upload-panel, .library-panel", {
        y: 28,
        autoAlpha: 0,
        duration: 0.65,
        stagger: 0.14,
        ease: "power2.out",
        scrollTrigger: {
            trigger: ".content-grid",
            start: "top 88%",
            once: true
        }
    });

    gsap.from(".site-footer", {
        y: 16,
        autoAlpha: 0,
        duration: 0.55,
        ease: "power2.out",
        scrollTrigger: {
            trigger: ".site-footer",
            start: "top 96%",
            once: true
        }
    });
}

function initializeSmoothScroll() {
    if (!window.Lenis || !window.gsap || !window.ScrollTrigger || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
    }

    const lenis = new window.Lenis({ autoRaf: false });
    lenis.on("scroll", () => window.ScrollTrigger.update());
    window.gsap.ticker.add((time) => lenis.raf(time * 1000));
    window.gsap.ticker.lagSmoothing(0);
}

function initializeCategoryDropdown() {
    const options = Array.from(categoryOptions.querySelectorAll(".category-option"));

    categoryTrigger.addEventListener("click", () => {
        setCategoryMenuOpen(categoryTrigger.getAttribute("aria-expanded") !== "true");
    });

    categoryTrigger.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setCategoryMenuOpen(true, true);
        } else if (event.key === "Escape" && categoryTrigger.getAttribute("aria-expanded") === "true") {
            event.preventDefault();
            setCategoryMenuOpen(false);
        }
    });

    categoryOptions.addEventListener("click", (event) => {
        const option = event.target.closest(".category-option");
        if (option) {
            selectCategory(option);
        }
    });

    categoryOptions.addEventListener("keydown", (event) => {
        const currentIndex = options.indexOf(event.target);
        let nextIndex = currentIndex;

        if (event.key === "ArrowDown") {
            nextIndex = (currentIndex + 1) % options.length;
        } else if (event.key === "ArrowUp") {
            nextIndex = (currentIndex - 1 + options.length) % options.length;
        } else if (event.key === "Home") {
            nextIndex = 0;
        } else if (event.key === "End") {
            nextIndex = options.length - 1;
        } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectCategory(event.target);
            return;
        } else if (event.key === "Escape") {
            event.preventDefault();
            setCategoryMenuOpen(false);
            categoryTrigger.focus();
            return;
        } else {
            return;
        }

        event.preventDefault();
        options[nextIndex].focus();
    });

    document.addEventListener("pointerdown", (event) => {
        if (!categoryPicker.contains(event.target)) {
            setCategoryMenuOpen(false);
        }
    });

    document.addEventListener("focusin", (event) => {
        if (!categoryPicker.contains(event.target)) {
            setCategoryMenuOpen(false);
        }
    });
}

function setCategoryMenuOpen(isOpen, focusSelected = false) {
    categoryTrigger.setAttribute("aria-expanded", String(isOpen));

    if (isOpen) {
        categoryOptions.hidden = false;
        if (window.gsap && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            gsap.killTweensOf(categoryOptions);
            gsap.fromTo(categoryOptions,
                { autoAlpha: 0, y: -8, scale: 0.98 },
                { autoAlpha: 1, y: 0, scale: 1, duration: 0.2, ease: "power2.out", clearProps: "transform" }
            );
        }

        if (focusSelected) {
            categoryOptions.querySelector('[aria-selected="true"]').focus();
        }
        return;
    }

    if (window.gsap && !categoryOptions.hidden && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.killTweensOf(categoryOptions);
        gsap.to(categoryOptions, {
            autoAlpha: 0,
            y: -6,
            duration: 0.14,
            ease: "power1.in",
            onComplete: () => {
                categoryOptions.hidden = true;
                gsap.set(categoryOptions, { clearProps: "all" });
            }
        });
    } else {
        categoryOptions.hidden = true;
    }
}

function selectCategory(option) {
    categorySelect.value = option.dataset.value;
    categoryValue.textContent = option.textContent;
    categoryOptions.querySelectorAll(".category-option").forEach((item) => {
        item.setAttribute("aria-selected", String(item === option));
    });
    categorySelect.dispatchEvent(new Event("change", { bubbles: true }));
    setCategoryMenuOpen(false);
    categoryTrigger.focus();
}

function animateFileFolders() {
    if (!window.gsap || !window.ScrollTrigger || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
    }

    gsap.utils.toArray(".file-card").forEach((card) => {
        gsap.from(card, {
            y: 18,
            autoAlpha: 0,
            duration: 0.45,
            ease: "power2.out",
            scrollTrigger: {
                trigger: card,
                start: "top 92%",
                once: true
            }
        });
    });
    ScrollTrigger.refresh();
}

function createEmptyState() {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";

    const icon = document.createElement("span");
    icon.className = "empty-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "↗";

    const heading = document.createElement("h3");
    heading.textContent = "It’s a little quiet in here.";

    const message = document.createElement("p");
    message.textContent = "Add a file to start your library. Items will be grouped in folders by uploader.";
    emptyState.append(icon, heading, message);
    return emptyState;
}

function createNoResultsState() {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state search-empty-state";

    const heading = document.createElement("h3");
    heading.textContent = "No matching files";

    const message = document.createElement("p");
    message.textContent = "Try another search or choose a different category.";

    emptyState.append(heading, message);
    return emptyState;
}

function createFolder(folder) {
    const section = document.createElement("section");
    section.className = "uploader-folder";

    const heading = document.createElement("div");
    heading.className = "folder-heading";

    const icon = document.createElement("span");
    icon.className = "folder-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "▰";

    const name = document.createElement("h3");
    name.textContent = folder.name;

    const count = document.createElement("span");
    count.textContent = `${folder.items.length} ${folder.items.length === 1 ? "file" : "files"}`;
    heading.append(icon, name, count);

    const list = document.createElement("div");
    list.className = "file-list";
    folder.items.forEach((upload) => list.append(createFileCard(upload)));

    section.append(heading, list);
    return section;
}

function createFileCard(upload) {
    const card = document.createElement("article");
    card.className = "file-card";
    addCardHoverMotion(card);

    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = getFileExtension(upload.file.name);

    const info = document.createElement("div");
    info.className = "file-info";

    const title = document.createElement("h4");
    title.textContent = upload.title;

    const details = document.createElement("dl");
    details.className = "file-details";
    details.append(
        createFileDetail("File name", upload.file.name),
        createFileDetail("Uploader", upload.uploader),
        createFileDetail("Category", upload.category),
        createFileDetail("File date", formatDate(
            upload.file.lastModified ? new Date(upload.file.lastModified) : null
        )),
        createFileDetail("Size", formatFileSize(upload.file.size)),
        createFileDetail("Upload date", formatDate(upload.uploadedAt))
    );
    info.append(title, details);

    const actions = document.createElement("div");
    actions.className = "file-actions";

    const preview = document.createElement("button");
    preview.className = "preview-button";
    preview.type = "button";
    preview.textContent = "Preview";
    preview.setAttribute("aria-label", `Preview ${upload.title}`);
    preview.addEventListener("click", () => openPreview(upload));

    const download = document.createElement("a");
    download.className = "download-link";
    download.href = upload.url;
    download.download = upload.file.name;
    download.textContent = "Download";

    const remove = document.createElement("button");
    remove.className = "remove-button";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${upload.title}`);
    remove.addEventListener("click", () => removeUpload(upload.id));

    actions.append(preview, download, remove);
    card.append(icon, info, actions);
    return card;
}

function addCardHoverMotion(card) {
    if (!window.gsap || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
    }

    let pointerInside = false;
    let focusInside = false;

    const updateMotion = () => {
        gsap.to(card, {
            y: pointerInside || focusInside ? -4 : 0,
            scale: pointerInside || focusInside ? 1.01 : 1,
            duration: 0.2,
            ease: "power2.out",
            overwrite: "auto"
        });
    };

    card.addEventListener("pointerenter", () => {
        pointerInside = true;
        updateMotion();
    });
    card.addEventListener("pointerleave", () => {
        pointerInside = false;
        updateMotion();
    });
    card.addEventListener("focusin", () => {
        focusInside = true;
        updateMotion();
    });
    card.addEventListener("focusout", (event) => {
        if (!card.contains(event.relatedTarget)) {
            focusInside = false;
            updateMotion();
        }
    });
}

function openPreview(upload) {
    const requestId = ++previewRequestId;
    activePreviewId = upload.id;
    previewTitle.textContent = upload.title;
    previewFileName.textContent = upload.file.name;
    previewDownload.href = upload.url;
    previewDownload.download = upload.file.name;
    previewContent.replaceChildren();
    previewDialog.showModal();

    const file = upload.file;
    const extension = getFileExtension(file.name).toLocaleLowerCase();

    if (file.type.startsWith("image/")) {
        const image = document.createElement("img");
        image.className = "preview-image";
        image.src = upload.url;
        image.alt = `Preview of ${file.name}`;
        previewContent.append(image);
        return;
    }

    if (file.type === "application/pdf" || extension === "pdf") {
        const pdf = document.createElement("iframe");
        pdf.className = "preview-frame";
        pdf.src = upload.url;
        pdf.title = `Preview of ${file.name}`;
        previewContent.append(pdf);
        return;
    }

    if (file.type.startsWith("video/")) {
        const video = document.createElement("video");
        video.className = "preview-media";
        video.src = upload.url;
        video.controls = true;
        video.preload = "metadata";
        previewContent.append(video);
        return;
    }

    if (file.type.startsWith("audio/")) {
        const audio = document.createElement("audio");
        audio.className = "preview-media";
        audio.src = upload.url;
        audio.controls = true;
        audio.preload = "metadata";
        previewContent.append(audio);
        return;
    }

    if (isTextFile(file, extension)) {
        if (file.size > 1024 * 1024) {
            showPreviewNotice("This text file is larger than 1 MB, so it cannot be previewed here. You can download it instead.");
            return;
        }

        showPreviewNotice("Loading text preview…");
        file.text().then((text) => {
            if (requestId !== previewRequestId || !previewDialog.open) {
                return;
            }
            const textPreview = document.createElement("pre");
            textPreview.className = "preview-text";
            textPreview.textContent = text;
            previewContent.replaceChildren(textPreview);
        }).catch(() => {
            if (requestId === previewRequestId && previewDialog.open) {
                showPreviewNotice("This file could not be previewed. You can download it instead.");
            }
        });
        return;
    }

    showPreviewNotice("Preview is not available for this file type. You can download it to open it on your device.");
}

function isTextFile(file, extension) {
    const textExtensions = ["txt", "md", "csv", "json", "html", "css", "js", "ts", "xml", "yaml", "yml", "log"];
    return file.type.startsWith("text/")
        || ["application/json", "application/xml", "application/javascript"].includes(file.type)
        || textExtensions.includes(extension);
}

function showPreviewNotice(message) {
    const notice = document.createElement("p");
    notice.className = "preview-notice";
    notice.textContent = message;
    previewContent.replaceChildren(notice);
}

function removeUpload(id) {
    const index = uploads.findIndex((upload) => upload.id === id);
    if (index < 0) {
        return;
    }

    const upload = uploads[index];
    if (!window.confirm(`Delete "${upload.title}" from this browser tab? This cannot be undone.`)) {
        return;
    }

    if (activePreviewId === upload.id) {
        previewDialog.close();
    }

    URL.revokeObjectURL(uploads[index].url);
    uploads.splice(index, 1);
    renderLibrary();
    formMessage.textContent = "File deleted from this browser tab.";
}

function getFileExtension(fileName) {
    const parts = fileName.split(".");
    return parts.length > 1 ? parts.pop().slice(0, 5) : "FILE";
}

function formatFileSize(size) {
    if (size < 1024) {
        return `${size} B`;
    }
    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function createFileDetail(label, value) {
    const detail = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    detail.append(term, description);
    return detail;
}

function formatDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return "Not available";
    }

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(date);
}

function normalizeName(value) {
    return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}