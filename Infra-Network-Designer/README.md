# Infra Network Designer

Infra Network Designer (also known as IP Tool Kit) is a modern, responsive web application for managing and designing network infrastructures. 

## Features

- **Network Design Tools**: Advanced utilities for planning and configuring network architectures.
- **Dynamic Theming**: Built-in support for light and dark modes, automatically saved to your preferences.
- **Modern Interface**: A clean, premium UI with smooth animations and responsive design.
- **Self-contained Architecture**: Easy to deploy as a static site without requiring complex build steps.

## Project Structure

The project has been standardized for easy maintenance:

```text
├── index.html           # Main application entry point
├── version-history.html # Release notes and changelog UI
├── assets/
│   ├── css/
│   │   └── style.css    # Centralized stylesheet
│   ├── js/
│   │   └── script.js    # Application logic
│   └── images/
│       └── iptoolkit-icon.png # Brand assets
├── README.md            # Project documentation
└── CHANGELOG.md         # Version history
```

## Setup & Usage

To run this application locally, you do not need any build tools. Simply open `index.html` in your web browser or serve it using any standard static file server:

```bash
# Using Python 3's built-in http server
python3 -m http.server 8000
```
Then navigate to `http://localhost:8000`.

## Technologies

- **HTML5 & CSS3**: Structured with semantic HTML and styled with Vanilla CSS (no framework overhead).
- **JavaScript (Vanilla)**: Handles application logic and theme switching without external dependencies.
- **Fonts**: Uses Google Fonts (Inter, Zoho Puvi) for a crisp typography experience.

## Contributing

When contributing to this repository, please ensure that you update the `CHANGELOG.md` with any relevant changes and increment versions appropriately.

## License

This project is proprietary and confidential.
