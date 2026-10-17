#target photoshop

(function () {
    var TARGET_LAYER_NAME = "YOUR DESIGN HERE";
    var PREVIEW_MAX_EDGE = 1600;
    var PREVIEW_JPEG_QUALITY = 10;
    var configs = [
        {
            name: "Vertical Wall Art",
            mockups: "C:/Users/libar/Desktop/LBCreaStudio/Vertical Wall Art/Mockups",
            design: "C:/Users/libar/Desktop/LBCreaStudio/Vertical Wall Art/Listings/Listing 31/Upscayl.png"
        },
        {
            name: "Horizontal Wall Art",
            mockups: "C:/Users/libar/Desktop/LBCreaStudio/Horizontal Wall Art/Mockups",
            design: "C:/Users/libar/Desktop/LBCreaStudio/Horizontal Wall Art/Listings/Listing 10/Upscayl.png"
        },
        {
            name: "Nursery Wall Art",
            mockups: "C:/Users/libar/Desktop/LBCreaStudio/Nursery Wall Art/Mockups",
            design: "C:/Users/libar/Desktop/LBCreaStudio/Nursery Wall Art/Listings/Listing 10/Upscayl.png"
        },
        {
            name: "Frame TV Art",
            mockups: "C:/Users/libar/Desktop/LBCreaStudio/Frame TV Art/Mockups",
            design: "C:/Users/libar/Desktop/LBCreaStudio/Frame TV Art/Listings/Listing 17/Upscayl.png"
        }
    ];

    var previousDialogs = app.displayDialogs;
    app.displayDialogs = DialogModes.NO;
    app.bringToFront();

    try {
        for (var configIndex = 0; configIndex < configs.length; configIndex++) {
            processProduct(configs[configIndex]);
        }
    } finally {
        app.displayDialogs = previousDialogs;
    }

    function processProduct(config) {
        var mockupsRoot = new Folder(config.mockups);
        var designFile = new File(config.design);
        if (!mockupsRoot.exists) throw new Error("Mockups folder not found: " + config.mockups);
        if (!designFile.exists) throw new Error("Upscayl sample not found: " + config.design);

        var previewsRoot = ensureFolder(mockupsRoot.fsName + "/Previews");
        var listingOutput = ensureFolder(previewsRoot.fsName + "/Listing");
        var pinsOutput = ensureFolder(previewsRoot.fsName + "/Pines");
        var reportFile = new File(previewsRoot.fsName + "/preview-report.txt");
        var psdFiles = collectPsdFiles(mockupsRoot);
        var succeeded = 0;
        var failed = [];

        writeReport(reportFile, [
            "Product: " + config.name,
            "Sample: " + designFile.fsName,
            "PSD files: " + psdFiles.length,
            "Started: " + new Date().toString(),
            ""
        ].join("\r\n"), false);

        for (var index = 0; index < psdFiles.length; index++) {
            var psdFile = psdFiles[index];
            var isPin = psdFile.parent.name.toLowerCase() === "pines";
            var outputFolder = isPin ? pinsOutput : listingOutput;
            var outputFile = new File(
                outputFolder.fsName + "/" + psdFile.name.replace(/\.[^.]+$/, "") + ".jpg"
            );
            var beforeDocumentCount = app.documents.length;

            try {
                renderPreview(psdFile, designFile, outputFile);
                succeeded++;
                writeReport(
                    reportFile,
                    "OK " + (index + 1) + "/" + psdFiles.length + " - " + psdFile.fsName + "\r\n",
                    true
                );
            } catch (error) {
                failed.push(psdFile.fsName + " :: " + error.message);
                writeReport(
                    reportFile,
                    "ERROR " + (index + 1) + "/" + psdFiles.length + " - " + psdFile.fsName + " :: " + error.message + "\r\n",
                    true
                );
            } finally {
                closeDocumentsOpenedAfter(beforeDocumentCount);
                if ((index + 1) % 10 === 0) {
                    try { app.purge(PurgeTarget.ALLCACHES); } catch (_) { }
                }
            }
        }

        writeReport(reportFile, [
            "",
            "Completed: " + new Date().toString(),
            "Succeeded: " + succeeded,
            "Failed: " + failed.length,
            failed.length ? "\r\nFailures:\r\n" + failed.join("\r\n") : "",
            ""
        ].join("\r\n"), true);
    }

    function collectPsdFiles(mockupsRoot) {
        var output = [];
        var rootFiles = mockupsRoot.getFiles(function (entry) {
            return entry instanceof File && /\.psd$/i.test(entry.name);
        });
        var pinsFolder = new Folder(mockupsRoot.fsName + "/Pines");
        var pinFiles = pinsFolder.exists ? pinsFolder.getFiles(function (entry) {
            return entry instanceof File && /\.psd$/i.test(entry.name);
        }) : [];

        output = output.concat(rootFiles).concat(pinFiles);
        output.sort(function (left, right) {
            var a = left.fsName.toLowerCase();
            var b = right.fsName.toLowerCase();
            return a < b ? -1 : (a > b ? 1 : 0);
        });
        return output;
    }

    function renderPreview(psdFile, designFile, outputFile) {
        var mockupDoc = app.open(psdFile);
        var smartObjects = [];
        findSmartObjects(mockupDoc, TARGET_LAYER_NAME, smartObjects);
        if (smartObjects.length === 0) {
            throw new Error("Smart object layer not found: " + TARGET_LAYER_NAME);
        }

        for (var index = 0; index < smartObjects.length; index++) {
            mockupDoc.activeLayer = smartObjects[index];
            executeAction(stringIDToTypeID("placedLayerEditContents"));
            var smartDoc = app.activeDocument;
            duplicateAndCover(designFile, smartDoc);
            smartDoc.save();
            smartDoc.close(SaveOptions.SAVECHANGES);
            app.activeDocument = mockupDoc;
        }

        var previewDoc = mockupDoc.duplicate();
        preparePreviewDocument(previewDoc);
        savePreviewJpeg(previewDoc, outputFile);
        previewDoc.close(SaveOptions.DONOTSAVECHANGES);
        mockupDoc.close(SaveOptions.DONOTSAVECHANGES);
    }

    function duplicateAndCover(designFile, destinationDoc) {
        var sourceDoc = app.open(designFile);
        var sourceLayer = sourceDoc.activeLayer;
        try {
            if (sourceLayer.isBackgroundLayer) sourceLayer.isBackgroundLayer = false;
        } catch (_) { }
        var newLayer = sourceLayer.duplicate(destinationDoc, ElementPlacement.PLACEATBEGINNING);
        sourceDoc.close(SaveOptions.DONOTSAVECHANGES);

        app.activeDocument = destinationDoc;
        destinationDoc.activeLayer = newLayer;
        var bounds = newLayer.bounds;
        var layerWidth = bounds[2].as("px") - bounds[0].as("px");
        var layerHeight = bounds[3].as("px") - bounds[1].as("px");
        var documentWidth = destinationDoc.width.as("px");
        var documentHeight = destinationDoc.height.as("px");
        var scale = Math.max(documentWidth / layerWidth, documentHeight / layerHeight) * 100;

        newLayer.resize(scale, scale, AnchorPosition.MIDDLECENTER);
        centerLayer(newLayer, documentWidth, documentHeight);
    }

    function centerLayer(layer, documentWidth, documentHeight) {
        var bounds = layer.bounds;
        var centerX = (bounds[0].as("px") + bounds[2].as("px")) / 2;
        var centerY = (bounds[1].as("px") + bounds[3].as("px")) / 2;
        layer.translate(documentWidth / 2 - centerX, documentHeight / 2 - centerY);
    }

    function findSmartObjects(layerSet, targetName, output) {
        var lowerTarget = targetName.toLowerCase();
        for (var index = 0; index < layerSet.layers.length; index++) {
            var layer = layerSet.layers[index];
            if (
                layer.typename === "ArtLayer" &&
                layer.kind === LayerKind.SMARTOBJECT &&
                layer.name.toLowerCase() === lowerTarget
            ) {
                output.push(layer);
            }
            if (layer.typename === "LayerSet") {
                findSmartObjects(layer, targetName, output);
            }
        }
    }

    function preparePreviewDocument(doc) {
        app.activeDocument = doc;
        try { doc.changeMode(ChangeMode.RGB); } catch (_) { }
        try { doc.bitsPerChannel = BitsPerChannelType.EIGHT; } catch (__) { }
        try {
            doc.convertProfile("sRGB IEC61966-2.1", Intent.RELATIVECOLORIMETRIC, true, false);
        } catch (___) { }
        try { doc.flatten(); } catch (____) { }

        var width = doc.width.as("px");
        var height = doc.height.as("px");
        var longestEdge = Math.max(width, height);
        if (longestEdge > PREVIEW_MAX_EDGE) {
            var scale = PREVIEW_MAX_EDGE / longestEdge;
            doc.resizeImage(
                Math.max(1, Math.round(width * scale)),
                Math.max(1, Math.round(height * scale)),
                72,
                ResampleMethod.BICUBICSHARPER
            );
        }
    }

    function savePreviewJpeg(doc, outputFile) {
        var options = new JPEGSaveOptions();
        options.quality = PREVIEW_JPEG_QUALITY;
        options.embedColorProfile = true;
        options.formatOptions = FormatOptions.STANDARDBASELINE;
        doc.saveAs(outputFile, options, true, Extension.LOWERCASE);
        if (!outputFile.exists) throw new Error("Photoshop did not create the preview JPG.");
    }

    function closeDocumentsOpenedAfter(documentCount) {
        while (app.documents.length > documentCount) {
            try {
                app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
            } catch (_) {
                break;
            }
        }
    }

    function ensureFolder(folderPath) {
        var folder = new Folder(folderPath);
        if (folder.exists) return folder;
        if (folder.parent && !folder.parent.exists) ensureFolder(folder.parent.fsName);
        if (!folder.create()) throw new Error("Could not create folder: " + folderPath);
        return folder;
    }

    function writeReport(file, text, append) {
        file.encoding = "UTF8";
        if (!file.open(append ? "a" : "w")) return;
        file.write(text);
        file.close();
    }
})();
