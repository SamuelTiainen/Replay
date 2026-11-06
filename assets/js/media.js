
document.addEventListener("DOMContentLoaded", () => {

    // 1. Luetaan Replay-sivulta välitetyt tiedot
    const params = new URLSearchParams(window.location.search);

    const tapahtuma = params.get("tapahtuma");
    const urheilija = params.get("urheilija");
    const tuote = params.get("tuote");

    // 2. Haetaan HTML-elementit
    const eventName = document.getElementById("event-name");
    const athleteName = document.getElementById("athlete-name");
    const selectedProduct = document.getElementById("selected-product");
    const mediaContainer = document.getElementById("media-container");

    // 3. Tarkistetaan hakutiedot
    if (!tapahtuma || !urheilija || !tuote) {
        mediaContainer.textContent =
            "Ostotiedot puuttuvat. Palaa takaisin Replay-sivulle.";
        return;
    }

    // 4. Näytetään tapahtuman ja urheilijan tiedot
    eventName.textContent = tapahtuma;
    athleteName.textContent = urheilija;

    // 5. Mediapakettien sisältö
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

    // 6. Testimedia
    // Nämä korvataan myöhemmin SharePointin tiedostoilla.

    const testImages = [
        {
            title: "Ostettu kuva 1",
            url: "https://placehold.co/800x450?text=Ostettu+kuva+1"
        },
        {
            title: "Ostettu kuva 2",
            url: "https://placehold.co/800x450?text=Ostettu+kuva+2"
        }
    ];

    const testVideos = [
        {
            title: "Ostettu video 1",
            preview: "https://placehold.co/800x450?text=Videon+esikatselu+1",
            url: ""
        },
        {
            title: "Ostettu video 2",
            preview: "https://placehold.co/800x450?text=Videon+esikatselu+2",
            url: ""
        }
    ];

    // 7. Tyhjennetään mediagalleria
    mediaContainer.innerHTML = "";

    // 8. Luodaan mediakortti
    function createMediaCard(title, preview, type, downloadUrl) {

        const card = document.createElement("article");
        card.className = "media-card";

        const image = document.createElement("img");
        image.src = preview;
        image.alt = title;

        const heading = document.createElement("h3");
        heading.textContent = title;

        const description = document.createElement("p");
        description.textContent =
            type === "video" ? "MP4-video" : "JPEG-kuva";

        card.appendChild(image);
        card.appendChild(heading);
        card.appendChild(description);

        if (downloadUrl) {
            const download = document.createElement("a");

            download.href = downloadUrl;
            download.textContent = "Lataa media";
            download.className = "btn btn-primary";
            download.download = "";

            card.appendChild(download);
        } else {
            const info = document.createElement("p");
            info.textContent = "Alkuperäisen median lataus lisätään myöhemmin.";
            card.appendChild(info);
        }

        return card;
    }

    // 9. Näytetään pakettiin kuuluvat kuvat
    for (let i = 0; i < product.images; i++) {

        const media = testImages[i];

        mediaContainer.appendChild(
            createMediaCard(
                media.title,
                media.url,
                "image",
                ""
            )
        );
    }

    // 10. Näytetään pakettiin kuuluvat videot
    for (let i = 0; i < product.videos; i++) {

        const media = testVideos[i];

        mediaContainer.appendChild(
            createMediaCard(
                media.title,
                media.preview,
                "video",
                media.url
            )
        );
    }

});
