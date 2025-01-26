// app.js

const express = require("express");
const {
  queryGoogle,
  visitWebsiteUrl,
  closeBrowser,
} = require("./crawlerModule");
const basicAuth = require("./authMiddleware"); // Importar el middleware de autenticación

const app = express();
const port = process.env.PORT || 32100;

// Para manejar solicitudes JSON
app.use(express.json());

// **Ruta GET para la página de inicio (landing page)**
app.get("/", (req, res) => {
  res.send("<h1>Bienvenido a mi API</h1><p>Esta es la página de inicio.</p>");
});

// Aplicar el middleware de autenticación a todas las rutas excepto la página de inicio
app.use(basicAuth);

// Ruta POST para realizar la búsqueda en Google
app.post("/search", async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Se requiere el parámetro "query".' });
  }
  try {
    const html_content = await queryGoogle(query);
    res.json({ html_content });
  } catch (error) {
    console.error("Error en /search:", error);
    res.status(500).json({ error: "Error al realizar la búsqueda." });
  }
});

// Ruta GET para realizar la búsqueda en Google
app.get("/search", async (req, res) => {
  const query = req.query.query;
  if (!query) {
    return res.status(400).json({ error: 'Se requiere el parámetro "query".' });
  }
  try {
    const html_content = await queryGoogle(query);
    res.json({ html_content });
  } catch (error) {
    console.error("Error en /search:", error);
    res
      .status(500)
      .json({ error: "Error al realizar la búsqueda.", data: error });
  }
});

// Ruta POST para visitar una URL y obtener contenido
app.post("/visit", async (req, res) => {
  const { url, cssSelector, multiple } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Se requiere el parámetro "url".' });
  }
  try {
    const content = await visitWebsiteUrl(url, cssSelector, multiple);
    res.json({ content });
  } catch (error) {
    console.error("Error en /visit:", error);
    res.status(500).json({ error: "Error al obtener el contenido." });
  }
});

// Ruta GET para visitar una URL y obtener contenido
app.get("/visit", async (req, res) => {
  const url = req.query.url;
  const cssSelector = req.query.cssSelector;
  const multiple = req.query.multiple === "true"; // Convertir el parámetro a booleano
  if (!url) {
    return res.status(400).json({ error: 'Se requiere el parámetro "url".' });
  }
  try {
    const content = await visitWebsiteUrl(url, cssSelector, multiple);
    res.json({ content });
  } catch (error) {
    console.error("Error en /visit:", error);
    res.status(500).json({ error: "Error al obtener el contenido." });
  }
});

// Cerrar el navegador Puppeteer al terminar
process.on("SIGINT", async () => {
  console.log("Cerrando el navegador...");
  await closeBrowser();
  process.exit();
});

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
