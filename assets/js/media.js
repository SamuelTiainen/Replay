
const API_BASE = "http://127.0.0.1:8000";
const PURCHASE_KEY = "replay-purchase";

document.addEventListener("DOMContentLoaded", () => {
    const eventName = document.getElementById("event-name");
    const athleteName = document.getElementById("athlete-name");
    const selectedProduct = document.getElementById("selected-product");
    const mediaContainer = document.getElementById("media-container");

    const kindFilter = document.getElementById("kind");
    const orderFilter = document.getElementById("order");

    const dialog = document.getElementById("media-viewer");
    const viewerContent = document.getElementById("viewer-content");
    const closeViewer = document.getElementById("close-viewer");

    const euroFormat = new Intl.NumberFormat("fi-FI", {
        style: "currency",
        currency: "EUR"
    });

    // Luetaan ostotilaus selaimen tallennuksesta
    let purchase;

    try {
        purchase = JSON.parse(localStorage.getItem(PURCHASE_KEY));
    } catch (error) {
        console.error("Ostotietojen lukeminen epäonnistui:", error);
    }

    if (!purchase || !Array.isArray(purchase.items) || purchase.items.length === 0) {
        mediaContainer.textContent =
            "Ostettuja medioita ei löytynyt. Palaa Replay-sivulle.";
        return;
    }

    // Näytetään ostotilauksen tiedot
    eventName.textContent = purchase.eventName;
    athleteName.textContent = purchase.athleteName;

    const total = purchase.items.length * 10;

    selectedProduct.textContent =
        `${purchase.items.length} mediaa – ${euroFormat.format(total)}`;

    // Palautetaan käyttäjän viimeksi käyttämät suodattimet
    kindFilter.value = localStorage.getItem("replay-kind") || "all";

    orderFilter.value =
        localStorage.getItem("replay-order") === "old" ? "old" : "new";

    const selectedMedia = purchase.items;

    // Avataan kuva tai video suurennettuna
    function openViewer(item) {
        viewerContent.replaceChildren();

        const element = document.createElement(
            item.kind === "video" ? "video" : "img"
        );

        element.src = `${API_BASE}${item.preview}`;

        if (item.kind === "video") {
            element.controls = true;
            element.preload = "metadata";
            element.playsInline = true;
        } else {
            element.alt = item.filename;
        }

        viewerContent.appendChild(element);
        dialog.showModal();
    }

    closeViewer.addEventListener("click", () => {
        dialog.close();
    });

    dialog.addEventListener("close", () => {
        viewerContent.replaceChildren();
    });

    // Luodaan videosta esikatselukuva
    function createVideoThumbnail(url, image, fallback) {
        const video = document.createElement("video");

        video.src = url;
        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;

        video.addEventListener("loadedmetadata", () => {
            if (!video.duration || !Number.isFinite(video.duration)) {
                fallback.style.display = "flex";
                return;
            }

            video.currentTime = Math.min(1, video.duration / 2);
        }, { once: true });

        video.addEventListener("seeked", () => {
            try {
                const canvas = document.createElement("canvas");

                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                const context = canvas.getContext("2d");
                context.drawImage(video, 0, 0, canvas.width, canvas.height);

                image.src = canvas.toDataURL("image/jpeg", 0.85);
                image.style.display = "block";
                fallback.style.display = "none";

            } catch (error) {
                console.error("Videon esikatselukuvan luonti epäonnistui:", error);
                fallback.style.display = "flex";
            }

            video.removeAttribute("src");
            video.load();
        }, { once: true });

        video.addEventListener("error", () => {
            fallback.style.display = "flex";
        }, { once: true });

        video.load();
    }

    // Luodaan yksittäinen ostettu mediakortti
    function createMediaTile(item) {
        const wrapper = document.createElement("div");
        wrapper.className = "media-item";

        const button = document.createElement("button");
        button.className = "media-tile";
        button.type = "button";

        if (item.kind === "photo") {
            const image = document.createElement("img");

            image.src = item.thumb
                ? `${API_BASE}${item.thumb}`
                : `${API_BASE}${item.preview}`;

            image.alt = item.filename;
            image.loading = "lazy";

            button.appendChild(image);

        } else {
            const image = document.createElement("img");
            image.alt = item.filename;
            image.loading = "lazy";

            const fallback = document.createElement("div");
            fallback.className = "media-placeholder";
            fallback.textContent = "VIDEO";

            button.append(image, fallback);

// Videon play-kuvake
const playIcon = document.createElement("span");
playIcon.className = "replay-video-play";
playIcon.textContent = "▶";

button.appendChild(playIcon);

createVideoThumbnail(
    `${API_BASE}${item.preview}`,
    image,
    fallback
);
        }

        const meta = document.createElement("span");
        meta.className = "media-meta";
        meta.textContent =
            `${item.kind === "photo" ? "KUVA" : "VIDEO"} · ${item.filename}`;

        button.appendChild(meta);

        button.addEventListener("click", () => openViewer(item));

        // Latauslinkki alkuperäiseen tiedostoon
        const downloadLink = document.createElement("a");
        downloadLink.className = "media-download";
        downloadLink.href = `${API_BASE}${item.preview}`;
        downloadLink.download = item.filename;
        downloadLink.textContent = "Lataa tiedosto";

        wrapper.append(button, downloadLink);

        return wrapper;
    }

    // Näytetään ostetut mediat suodattimien mukaan
    function renderMedia() {
        let filtered = selectedMedia.filter(item =>
            kindFilter.value === "all" || item.kind === kindFilter.value
        );

        if (orderFilter.value === "old") {
            filtered = [...filtered].reverse();
        }

        mediaContainer.replaceChildren();

        if (filtered.length === 0) {
            mediaContainer.textContent =
                "Valitulla suodattimella ei löytynyt medioita.";
            return;
        }

        filtered.forEach(item => {
            mediaContainer.appendChild(createMediaTile(item));
        });
    }

    // Suodattimien muutokset
    kindFilter.addEventListener("change", () => {
        localStorage.setItem("replay-kind", kindFilter.value);
        renderMedia();
    });

    orderFilter.addEventListener("change", () => {
        localStorage.setItem("replay-order", orderFilter.value);
        renderMedia();
    });

    renderMedia();
});


