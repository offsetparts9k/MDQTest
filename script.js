// Get today's date in YYYY-MM-DD
const today = new Date().toISOString().split("T")[0];

function getUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                fetchPrayerTimes(lat, lon);
            },
            error => {
                console.error("Location error:", error);
                document.getElementById("prayer-times").innerHTML =
                    "<tr><td colspan='3'>Location permission denied. Please allow location access.</td></tr>";
            }
        );
    } else {
        document.getElementById("prayer-times").innerHTML =
            "<tr><td colspan='3'>Geolocation is not supported by your browser.</td></tr>";
    }
}

async function fetchPrayerTimes(lat, lon) {
    const apiURL = `https://api.aladhan.com/v1/timings/${Math.floor(Date.now() / 1000)}?latitude=${lat}&longitude=${lon}&method=2`;

    try {
        const res = await fetch(apiURL);
        if (!res.ok) throw new Error("API request failed");

        const data = await res.json();
        const timings = data.data.timings;

        // Save in localStorage with today's date
        localStorage.setItem("adhanTimes", JSON.stringify({ date: today, timings, lat, lon }));

        displayPrayerTimes(timings);
    } catch (error) {
        console.error("Fetch error:", error);

        // Try cached data
        const cached = JSON.parse(localStorage.getItem("adhanTimes"));
        if (cached && cached.date === today) {
            console.warn("Using cached data");
            displayPrayerTimes(cached.timings);
        } else {
            document.getElementById("prayer-times").innerHTML =
                "<tr><td colspan='3'>Unable to fetch Adhan times and no cached data available.</td></tr>";
        }
    }
}

function displayPrayerTimes(timings) {
    const tableBody = document.getElementById("prayer-times");
    tableBody.innerHTML = "";

    const prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

    prayers.forEach(prayer => {
        const row = `<tr>
            <td>${prayer}</td>
            <td>${timings[prayer]}</td>
            <td>--:--</td> <!-- Placeholder for Iqamah -->
        </tr>`;
        tableBody.innerHTML += row;
    });
}

// Start process
getUserLocation();
