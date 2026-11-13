
const API_BASE = "http://127.0.0.1:8000";

document.addEventListener("DOMContentLoaded", async () => {
    const params = new URLSearchParams(window.location.search);

    const tapahtuma = params.get("tapahtuma");
    const urheilija = params.get("urheilija");
    const tuote = params.get("tuote");

    const eventName = document.getElementById("event-name");
    const athleteName = document.getElementById("athlete-name");
    const selectedProduct = document.getElementById("selected-product");
    const mediaContainer = document.getElementById("media-container");

    const dialog = document.getElementById("media-viewer");
    const viewerContent = document.getElementById("viewer-content");
    const closeViewer = document.getElementById("close-viewer");

    if (!tapahtuma || !urheilija || !tuote) {
        mediaContainer.textContent =
            "Ostotiedot puuttuvat. Palaa takaisin Replay-sivulle.";
        return;
    }

    eventName.textContent = tapahtuma;
    athleteName.textContent = urheilija;

    const products = {
        kuva: { name: "1 kuva - 10 €", images: 1, videos: 0 },
        video: { name: "1 video - 10 €", images: 0, videos: 1 },
        kuva_video: { name: "1 kuva + 1 video - 20 €", images: 1, videos: 1 },
        "2kuvaa_2videota": {
            name: "2 kuvaa + 2 videota - 30 €",
            images: 2,
            videos: 2
        }
    };

    const product = products[tuote];

    if (!product) {
        mediaContainer.textContent = "Tuntematon mediapaketti.";
        return;
    }

    selectedProduct.textContent =
        "Valittu mediapaketti: " + product.name;

    function openViewer(item) {
        viewerContent.replaceChildren();

        const element = document.createElement(
            item.kind === "video" ? "video" : "img"
        );

        element.src = `${API_BASE}${item.preview}`;

        if (item.kind === "video") {
            element.controls = true;
            element.autoplay = false;
            element.preload = "metadata";
        } else {
            element.alt = item.filename;
        }

        viewerContent.appendChild(element);
        dialog.showModal();
    }

    closeViewer.addEventListener("click", () => dialog.close());

    dialog.addEventListener("close", () => {
        viewerContent.replaceChildren();
    });

    function createMediaTile(item) {
        const button = document.createElement("button");
        button.className = "media-tile";
        button.type = "button";

        if (item.thumb) {
            const image = document.createElement("img");
            image.src = `${API_BASE}${item.thumb}`;
            image.alt = item.filename;
            image.loading = "lazy";
            button.appendChild(image);
        } else {
            const placeholder = document.createElement("div");
            placeholder.className = "media-placeholder";
            placeholder.textContent =
                item.kind === "video" ? "▶" : "KUVA";
            button.appendChild(placeholder);
        }

        const meta = document.createElement("span");
        meta.className = "media-meta";
        meta.textContent =
            `${item.kind === "photo" ? "KUVA" : "VIDEO"} · ${item.filename}`;

        button.appendChild(meta);

        button.addEventListener("click", () => openViewer(item));

        return button;
    }

    mediaContainer.textContent = "Haetaan medioita...";

    try {
        const response = await fetch(`${API_BASE}/api/manifest`, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const manifest = await response.json();
        const allMedia = manifest.photos || [];

        const images = allMedia.filter(item => item.kind === "photo");
        const videos = allMedia.filter(item => item.kind === "video");

        const selectedImages = images.slice(0, product.images);
        const selectedVideos = videos.slice(0, product.videos);

        mediaContainer.replaceChildren();

        [...selectedImages, ...selectedVideos].forEach(item => {
            mediaContainer.appendChild(createMediaTile(item));
        });

        if (!selectedImages.length && !selectedVideos.length) {
            mediaContainer.textContent =
                "Replay-palvelimella ei ole vielä sopivaa testimediaa.";
        }

    } catch (error) {
        console.error("Replay API -virhe:", error);

        mediaContainer.textContent =
            "Median hakeminen epäonnistui. Tarkista Replay-palvelimen toiminta.";
    }
});

