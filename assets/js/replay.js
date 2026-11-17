
const API_BASE = "http://127.0.0.1:8000";

// Haetaan tapahtumat palvelimelta
async function loadEvents() {
    const eventSearch = document.getElementById("event-search");

    if (!eventSearch) {
        console.error("Tapahtumavalikkoa ei löytynyt.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/events`);

        if (!response.ok) {
            throw new Error("Tapahtumien hakeminen epäonnistui.");
        }

        const data = await response.json();

        // Tyhjennetään vanhat vaihtoehdot
        eventSearch.innerHTML = '<option value="">Valitse tapahtuma</option>';

        // Lisätään tietokannasta löytyvät tapahtumat
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

// Käynnistetään tapahtumien haku sivun latautuessa
document.addEventListener("DOMContentLoaded", () => {
    loadEvents();
});
