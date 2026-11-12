const API_BASE = "http://localhost:8000";
document.addEventListener("DOMContentLoaded", async () => {
    const API_BASE = ""; // Sama verkkotunnus kuin Striimaamon sivuilla

    const params = new URLSearchParams(window.location.search);

    const tapahtuma = params.get("tapahtuma");
    const urheilija = params.get("urheilija");
    const tuote = params.get("tuote");

    const eventName = document.getElementById("event-name");
    const athleteName = document.getElementById("athlete-name");
    const selectedProduct = document.getElementById("selected-product");
    const mediaContainer = document.getElementById("media-container");

    if (!tapahtuma || !urheilija || !tuote) {
        mediaContainer.textContent =
            "Ostotiedot puuttuvat. Palaa takaisin Replay-sivulle.";
        return;
    }

    eventName.textContent = tapahtuma;
    athleteName.textContent = urheilija;

    const products = {
        kuva: {
            name: "1 kuva - 10 €",
            images: 1,
            videos: 0
        },
        video: {
            name: "1 video - 10 €",
            images: 0,
            videos: 1
        },
        kuva_video: {
            name: "1 kuva + 1 video - 20 €",
            images: 1,
            videos: 1
        },
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
        "Ostettu mediapaketti: " + product.name;

    mediaContainer.replaceChildren();

    const status = document.createElement("p");
    status.textContent = "Haetaan mediaa Replay-palvelimelta...";
    mediaContainer.appendChild(status);

    try {
        const response = await fetch(
            `${API_BASE}/api/manifest`,
            { cache: "no-store" }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const manifest = await response.json();

        const allMedia = manifest.photos || [];

        const images = allMedia.filter(item => item.kind === "photo");
        const videos = allMedia.filter(item => item.kind === "video");

        // Demoversiossa näytetään tietokannan testimediaa.
        const selectedImages = images.slice(0, product.images);
        const selectedVideos = videos.slice(0, product.videos);

        mediaContainer.replaceChildren();

        function createMediaCard(item) {
            const card = document.createElement("article");
            card.className = "media-card";

            if (item.kind === "photo") {
                const image = document.createElement("img");
                image.src = `${API_BASE}${item.thumb || item.preview}`;
                image.alt = item.filename;
                image.loading = "lazy";

                card.appendChild(image);
            } else {
                const video = document.createElement("video");
                video.src = `${API_BASE}${item.preview}`;
                video.controls = true;
                video.preload = "metadata";

                if (item.thumb) {
                    video.poster = `${API_BASE}${item.thumb}`;
                }

                card.appendChild(video);
            }

            const heading = document.createElement("h3");
            heading.textContent = item.filename;

            const description = document.createElement("p");
            description.textContent =
                item.kind === "video" ? "MP4-video" : "Valokuva";

            const download = document.createElement("a");
            download.href = `${API_BASE}${item.preview}`;
            download.textContent = "Lataa media";
            download.className = "btn btn-primary";
            download.download = item.filename;

            card.append(heading, description, download);

            return card;
        }

        [...selectedImages, ...selectedVideos].forEach(item => {
            mediaContainer.appendChild(createMediaCard(item));
        });

        if (!selectedImages.length && !selectedVideos.length) {
            mediaContainer.textContent =
                "Replay-palvelimella ei ole vielä tähän pakettiin sopivaa testimediaa.";
        }

    } catch (error) {
        console.error("Replay API -virhe:", error);

        mediaContainer.textContent =
            "Median hakeminen epäonnistui. Tarkista Replay-palvelimen toiminta.";
    }
});
