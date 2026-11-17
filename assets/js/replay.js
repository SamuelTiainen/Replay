
const API_BASE = "http://127.0.0.1:8000";

let athletes = [];

// Ostoskorin tiedot
const MEDIA_PRICE = 10;
let cartItems = [];

const euroFormat = new Intl.NumberFormat("fi-FI", {
    style: "currency",
    currency: "EUR"
});

// Haetaan tapahtumat palvelimelta
async function loadEvents() {
    const eventSearch = document.getElementById("event-search");

    try {
        const response = await fetch(`${API_BASE}/api/events`);

        if (!response.ok) {
            throw new Error("Tapahtumien hakeminen epäonnistui.");
        }

        const data = await response.json();

        eventSearch.innerHTML =
            '<option value="">Valitse tapahtuma</option>';

        data.events.forEach(event => {
            const option = document.createElement("option");
            option.value = event.id;
            option.textContent = event.name;
            eventSearch.appendChild(option);
        });

    } catch (error) {
        console.error("Tapahtumien latausvirhe:", error);
    }
}


// Luodaan suurempi median katseluikkuna
function createMediaViewer() {
    let dialog = document.getElementById("replay-media-viewer");

    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.id = "replay-media-viewer";
    dialog.className = "replay-media-viewer";

    dialog.innerHTML = `
        <div class="replay-viewer-inner">
            <button type="button" class="replay-viewer-close"
                aria-label="Sulje katselu">×</button>
            <div id="replay-viewer-content"></div>
        </div>
    `;

    document.body.appendChild(dialog);

    dialog.querySelector(".replay-viewer-close")
        .addEventListener("click", () => dialog.close());

    dialog.addEventListener("click", event => {
        if (event.target === dialog) dialog.close();
    });

    dialog.addEventListener("contextmenu", event => {
        event.preventDefault();
    });

    return dialog;
}


// Avataan kuva tai video suurempaan katseluun
function openMediaViewer(item) {
    const dialog = createMediaViewer();
    const content = dialog.querySelector("#replay-viewer-content");

    content.innerHTML = "";

    if (item.kind === "photo") {
        const image = document.createElement("img");

        image.src = `${API_BASE}${item.preview}`;
        image.alt = item.filename;
        image.draggable = false;

        content.appendChild(image);

    } else {
        const video = document.createElement("video");

        video.src = `${API_BASE}${item.preview}`;
        video.controls = true;
        video.preload = "metadata";
        video.playsInline = true;
        video.controlsList = "nodownload noplaybackrate";
        video.disablePictureInPicture = true;

        content.appendChild(video);
    }

    if (!dialog.open) dialog.showModal();
}


// Muodostetaan videosta esikatselukuva
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


// Haetaan valitun tapahtuman osallistujat
async function loadAthletes(eventId) {
    const results = document.getElementById("athlete-results");

    results.innerHTML = "<p>Haetaan osallistujia...</p>";

    try {
        const response = await fetch(
            `${API_BASE}/api/events/${eventId}/athletes`
        );

        if (!response.ok) {
            throw new Error("Osallistujien hakeminen epäonnistui.");
        }

        const data = await response.json();
        athletes = data.athletes;

        renderAthletes();

    } catch (error) {
        console.error("Osallistujien latausvirhe:", error);
        results.innerHTML = "<p>Osallistujien lataaminen epäonnistui.</p>";
    }
}


// Näytetään osallistujat hakutuloksissa

function renderAthletes() {
    const results = document.getElementById("athlete-results");
    const search = document
        .getElementById("athlete-search")
        .value.trim().toLowerCase();

    results.innerHTML = "";

    // Tyhjennetään media, jos hakukenttä tyhjennetään
    if (!search) {
        results.innerHTML = "<p>Kirjoita osallistujan nimi.</p>";
        document.getElementById("replay-media-grid").innerHTML = "";
        return;
    }

    // Etsitään täsmälleen vastaava osallistuja
    const athlete = athletes.find(item =>
        item.name.trim().toLowerCase() === search
    );

    if (!athlete) {
        results.innerHTML = "<p>Kirjoita osallistujan koko nimi.</p>";
        document.getElementById("replay-media-grid").innerHTML = "";
        return;
    }

    results.innerHTML = `<p>Valittu osallistuja: ${athlete.name}</p>`;

    selectAthlete(athlete);
}



// Valitaan osallistuja ja haetaan hänen mediansa
async function selectAthlete(athlete) {
    const eventId = document.getElementById("event-search").value;
    const grid = document.getElementById("replay-media-grid");

    grid.innerHTML = "<p>Haetaan kuvia ja videoita...</p>";

    try {
        const response = await fetch(
            `${API_BASE}/api/events/${eventId}/athletes/${athlete.id}/media`
        );

        if (!response.ok) {
            throw new Error("Medioiden hakeminen epäonnistui.");
        }

        const data = await response.json();

        renderMedia(data.media);

    } catch (error) {
        console.error("Medioiden latausvirhe:", error);
        grid.innerHTML = "<p>Medioiden lataaminen epäonnistui.</p>";
    }
}



function toggleCart(item) {
    const existingIndex = cartItems.findIndex(
        cartItem => cartItem.id === item.id
    );

    if (existingIndex !== -1) {
        cartItems.splice(existingIndex, 1);
    } else {
        cartItems.push(item);
    }

    renderCart();
    updateCartButtons();
}


// Päivitetään ostoskorin sisältö ja kokonaishinta
function renderCart() {
    const cartElement = document.getElementById("replay-cart-items");
    const totalElement = document.getElementById("replay-cart-total");

    cartElement.innerHTML = "";

    if (cartItems.length === 0) {
        cartElement.innerHTML = "<p>Ei vielä valittuja medioita.</p>";
    } else {
        cartItems.forEach(item => {
            const row = document.createElement("div");
            row.className = "replay-cart-item";

            const name = document.createElement("span");
            name.textContent = item.filename;

            const price = document.createElement("strong");
            price.textContent = euroFormat.format(MEDIA_PRICE);

            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.textContent = "Poista";

            removeButton.addEventListener("click", () => {
                toggleCart(item);
            });

            row.append(name, price, removeButton);
            cartElement.appendChild(row);
        });
    }

    const total = cartItems.length * MEDIA_PRICE;
    totalElement.textContent = euroFormat.format(total);
}


// Päivitetään gallerian painikkeiden tekstit
function updateCartButtons() {
    document.querySelectorAll(".replay-add-to-cart").forEach(button => {
        const isInCart = cartItems.some(
            item => item.id === button.dataset.mediaId
        );

        button.textContent = isInCart
            ? "Poista ostoskorista"
            : "Lisää ostoskoriin";

        button.classList.toggle("in-cart", isInCart);
    });
}


// Näytetään osallistujan kuvat ja videot


function renderMedia(mediaItems) {
    const grid = document.getElementById("replay-media-grid");
    const emptyCard = document.querySelector(".replay-media-empty");

    grid.innerHTML = "";

    if (mediaItems.length === 0) {
        emptyCard.style.display = "block";
        grid.innerHTML = "<p>Tälle osallistujalle ei löytynyt mediaa.</p>";
        return;
    }

    emptyCard.style.display = "none";

    mediaItems.forEach(item => {
        const card = document.createElement("div");
        card.className = "replay-media-card";
        card.tabIndex = 0;
        card.setAttribute("role", "button");

        const preview = document.createElement("div");
        preview.className = "replay-media-preview";

        const image = document.createElement("img");
        image.alt = item.filename;
        image.draggable = false;

        preview.appendChild(image);

        if (item.kind === "photo") {
            image.src = item.thumb
                ? `${API_BASE}${item.thumb}`
                : `${API_BASE}${item.preview}`;

        } else {
            const fallback = document.createElement("div");
            fallback.className = "replay-video-fallback";
            fallback.textContent = "VIDEO";

            preview.appendChild(fallback);

            const playIcon = document.createElement("span");
            playIcon.className = "replay-video-play";
            playIcon.textContent = "▶";

            preview.appendChild(playIcon);

            createVideoThumbnail(
                `${API_BASE}${item.preview}`,
                image,
                fallback
            );
        }

        const filename = document.createElement("p");
        filename.textContent = item.filename;

       
card.appendChild(preview);
card.appendChild(filename);

// Hinta
const priceLabel = document.createElement("span");
priceLabel.className = "replay-media-price";
priceLabel.textContent = euroFormat.format(MEDIA_PRICE);

// Ostoskoripainike
const cartButton = document.createElement("button");

cartButton.type = "button";
cartButton.className = "replay-add-to-cart";
cartButton.dataset.mediaId = item.id;

const isInCart = cartItems.some(
    cartItem => cartItem.id === item.id
);

cartButton.textContent = isInCart
    ? "Poista ostoskorista"
    : "Lisää ostoskoriin";

if (isInCart) {
    cartButton.classList.add("in-cart");
}

cartButton.addEventListener("click", event => {
    event.stopPropagation();
    toggleCart(item);
});

// Hinta ja painike samalle riville
const actionRow = document.createElement("div");
actionRow.className = "replay-media-actions";

actionRow.appendChild(priceLabel);
actionRow.appendChild(cartButton);

card.appendChild(actionRow);
grid.appendChild(card);


        card.addEventListener("click", () => {
            openMediaViewer(item);
        });

        card.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openMediaViewer(item);
            }
        });

        card.addEventListener("contextmenu", event => {
            event.preventDefault();
        });

        
    });
}




// Sivun tapahtumat
document.addEventListener("DOMContentLoaded", () => {
        renderCart();
    const eventSearch = document.getElementById("event-search");
    const athleteSearch = document.getElementById("athlete-search");

    loadEvents();

    // Tapahtuman vaihtuessa haetaan sen osallistujat
    eventSearch.addEventListener("change", () => {
        const eventId = eventSearch.value;

        athletes = [];
        athleteSearch.value = "";

        document.getElementById("replay-media-grid").innerHTML = "";

        if (!eventId) {
            document.getElementById("athlete-results").innerHTML =
                "<p>Valitse ensin tapahtuma.</p>";
            return;
        }

        loadAthletes(eventId);
    });

    // Osallistujien hakeminen nimellä tai kilpailunumerolla
    athleteSearch.addEventListener("input", renderAthletes);
});

