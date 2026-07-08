# AI Prompts Used

## Planning

I'm building a single-page web app called EpiTrack for parents tracking a child's epilepsy. It uses HTML, CSS, and vanilla JavaScript with no backend — all data stored in localStorage. Help me design the data structure for medications, medication doses, missed doses, seizure events, notes, and triggers

## Boilerplate and Layout
    - Based on that data structure, create the HTML boilerplate and a dashboard layout with a sidebar nav and a main content area. Keep it clean and accessible since the users are stressed caregivers.
    - Change the dashboard view and highlight nav item when nav item is clicked
## Features

    - Sketch the storage access layer
    -On the medications view, create a layout to view all medications and add medication button that calls to the getAll and insert functions in the storage.js file
    - Users should be able to add and view medication doses on main dashboard view and doses dashboard view
    - Users should be able to view all triggers, add a trigger type, and view associated seizures based on trigger type
    - Users should be able to view and edit all notes, each note should open a modal showing the seizure event. 

## Debugging
    - I have organizaed all my js files into /scripts directory. Now I am getting this error in the console: Loading module from “http://127.0.0.1:5500/medications.js” was blocked because of a disallowed MIME type (“text/html”).

    - Help me identify why medId is logging as a click event and not the id number
## Explanation
    - How does the form handle validation
    - Explain edge case scenarios for this application

## Verification
    - Users should be able to click "view all" button on home view that takes them to doses view
    - Doses view should have total taken, total missed, and total on doses view
    - On dashboard in the Today's Medications card, it should list "Taken at [time]" or "Missed [time] dose" instead of checks and x
    - Users should be limited on duration for logging seizure duration based on reasoning for typical seizures
