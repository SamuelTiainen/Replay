
const API_BASE = "http://127.0.0.1:8000";

let athletes = [];

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

    // Piilotetaan YOUR MOMENT -aloituskortti
    emptyCard.style.display = "none";

    mediaItems.forEach(item => {
        const card = document.createElement("div");
        card.className = "replay-media-card";

        if (item.kind === "photo") {
            const image = document.createElement("img");

            image.src = item.thumb
                ? `${API_BASE}${item.thumb}`
                : `${API_BASE}${item.preview}`;

            image.alt = item.filename;
            image.loading = "lazy";

            card.appendChild(image);

        } else if (item.kind === "video") {
            const video = document.createElement("video");

            video.src = `${API_BASE}${item.preview}`;
            video.controls = true;
            video.preload = "metadata";

            card.appendChild(video);
        }

        const filename = document.createElement("p");
        filename.textContent = item.filename;

        card.appendChild(filename);
        grid.appendChild(card);
    });
}



// Sivun tapahtumat
document.addEventListener("DOMContentLoaded", () => {
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

