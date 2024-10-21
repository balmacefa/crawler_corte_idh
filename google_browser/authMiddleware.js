// authMiddleware.js

function basicAuth(req, res, next) {
  // Verificar si el encabezado Authorization está presente
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Protected Area"');
    return res.status(401).send("Autenticación requerida.");
  }

  // Decodificar las credenciales
  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString(
    "ascii"
  );
  const [username, password] = credentials.split(":");

  // Verificar las credenciales (reemplaza con tu lógica de autenticación)
  const validUsername = "admin";
  const validPassword = "admin";

  if (username === validUsername && password === validPassword) {
    // Credenciales válidas, continuar
    next();
  } else {
    res.setHeader("WWW-Authenticate", 'Basic realm="Protected Area"');
    return res.status(401).send("Credenciales inválidas.");
  }
}

module.exports = basicAuth;
