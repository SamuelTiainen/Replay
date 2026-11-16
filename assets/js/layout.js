
async function loadComponent(elementId, file) {
    const element = document.getElementById(elementId);

    if (!element) return;

    try {
        const response = await fetch(file);

        if (!response.ok) {
            throw new Error(`Could not load ${file}: ${response.status}`);
        }

        element.innerHTML = await response.text();

    } catch (error) {
        console.error(error);
    }
}

async function loadLayout() {
    await Promise.all([
        loadComponent("header-placeholder", "header.html"),
        loadComponent("footer-placeholder", "footer.html")
    ]);

    const menuToggle = document.querySelector(".menu-toggle");
    const navigation = document.querySelector("#site-nav");

    if (!menuToggle || !navigation) {
        console.warn("Mobiilivalikon elementtejä ei löytynyt.");
        return;
    }

    // Mobiilivalikon avaaminen ja sulkeminen
    menuToggle.addEventListener("click", () => {
        const isOpen =
            menuToggle.getAttribute("aria-expanded") === "true";

        menuToggle.setAttribute("aria-expanded", String(!isOpen));
        navigation.classList.toggle("active", !isOpen);
    });

    // Suljetaan valikko navigointilinkkiä painettaessa
    navigation.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => {
            menuToggle.setAttribute("aria-expanded", "false");
            navigation.classList.remove("active");
        });
    });
}

document.addEventListener("DOMContentLoaded", loadLayout);

