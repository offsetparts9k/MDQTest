const apiURL = "https://api.aladhan.com/v1/timingsByCity?city=Bay%20Shore&country=US&method=2";

// Get today's date in YYYY-MM-DD
const today = new Date().toISOString().split("T")[0];

async function fetchPrayerTimes() {
    try {
        const res = await fetch(apiURL);
        if (!res.ok) throw new Error("API request failed");

        const data = await res.json();
        const timings = data.data.timings;

        // Save in localStorage with today's date
        localStorage.setItem("adhanTimes", JSON.stringify({ date: today, timings }));

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
                "<tr><td colspan='2'>Unable to fetch Adhan times and no cached data available.</td></tr>";
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

fetchPrayerTimes();
