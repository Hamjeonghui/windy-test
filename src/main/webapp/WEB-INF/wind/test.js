$("#map").click(function(event) {
    var velocityLayer = L.velocityLayer({
        displayValues: true,
        displayOptions: {
            // label prefix
            velocityType: "Global Wind",

            // leaflet control position
            position: "bottomleft",

            // no data at cursor
            emptyString: "No velocity data",

            // see explanation below
            angleConvention: "bearingCW",

            // display cardinal direction alongside degrees
            showCardinal: false,

            // one of: ['ms', 'k/h', 'mph', 'kt']
            speedUnit: "ms",

            // direction label prefix
            directionString: "Direction",

            // speed label prefix
            speedString: "Speed",
        },
        data: "wind-global.json", // see demo/*.json, or wind-js-server for example data service

        // OPTIONAL
        minVelocity: 0, // used to align color scale
        maxVelocity: 10, // used to align color scale
        velocityScale: 0.005, // modifier for particle animations, arbitrarily defaults to 0.005
        colorScale: ["#880808"], // define your own array of hex/rgb colors
        onAdd: null, // callback function
        onRemove: null, // callback function
        opacity: 0.97, // layer opacity, default 0.97

        // optional pane to add the layer, will be created if doesn't exist
        // optional pane to add the layer, will be created if doesn't exist
        // leaflet v1+ only (falls back to overlayPane for < v1)
        paneName: "overlayPane",
    });
});
