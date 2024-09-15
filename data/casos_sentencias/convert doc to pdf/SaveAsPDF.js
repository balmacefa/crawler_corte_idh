var obj = new ActiveXObject("Scripting.FileSystemObject");
var docPath = WScript.Arguments(0);
docPath = obj.GetAbsolutePathName(docPath);

var pdfPath = docPath.replace(/\.doc[^.]*$/, ".pdf");

// Verifica si el archivo PDF ya existe
if (obj.FileExists(pdfPath)) {
    WScript.Echo("El archivo PDF '" + pdfPath + "' ya existe. Saltando la conversión...");
    WScript.Quit();
}

var objWord = null;

try
{
    objWord = new ActiveXObject("Word.Application");
    objWord.Visible = false;

    var objDoc = objWord.Documents.Open(docPath);

    var format = 17;
    objDoc.SaveAs(pdfPath, format);
    objDoc.Close();

    WScript.Echo("Guardando '" + docPath + "' como '" + pdfPath + "'...");
}
finally
{
    if (objWord != null)
    {
        objWord.Quit();
    }
}
