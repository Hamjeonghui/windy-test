/* 1km 윈드 그리드를 통한 입자의 움직임을 시뮬레이션하기 위한 글로벌 클래스
크레딧: 이 작업에 대한 모든 크레딧은 https://github.com/cambecc에 있습니다.
https://github.com/cambecc/earth. 이 코드의 대부분은 훌륭하기 때문에 거기에서 직접 가져옵니다.
이 클래스는 캔버스 요소와 데이터 배열을 사용합니다(http://www.emc.ncep.noaa.gov/index.php?branch=GFS의 1km GFS).
그런 다음 메르카토르(정방향/역방향) 투영을 사용하여 "지도 공간"에서 바람 벡터를 올바르게 매핑합니다.
"start" 메소드는 현재 범위에서 맵의 경계를 가져오고 전체 그리딩을 시작합니다.
보간 및 애니메이션 프로세스.
*/

var Windy = function(params) {
    var MIN_VELOCITY_INTENSITY = params.minVelocity || 0; // 입자 강도가 최소가 되는 속도(m/s)
    var MAX_VELOCITY_INTENSITY = params.maxVelocity || 10; // 입자 강도가 최대가 되는 속도(m/s)
    var VELOCITY_SCALE =
        (params.velocityScale || 0.005) *
        (Math.pow(window.devicePixelRatio, 1 / 3) || 1); // 풍속의 척도(완전히 임의적입니다. 이 값은 멋져 보입니다.)
    var MAX_PARTICLE_AGE = params.particleAge || 90; // 재생성 전에 파티클이 그려지는 최대 프레임 수
    var PARTICLE_LINE_WIDTH = params.lineWidth || 1; // 그려진 입자의 선 너비
    var PARTICLE_MULTIPLIER = params.particleMultiplier || 1 / 300; // 입자 수 스칼라(완전히 임의적입니다. 이 값은 좋아 보입니다.)
    var PARTICLE_REDUCTION = Math.pow(window.devicePixelRatio, 1 / 3) || 1.6; // 모바일의 파티클 수에 이 양을 곱합니다.
    var FRAME_RATE = params.frameRate || 15;
    var FRAME_TIME = 1000 / FRAME_RATE;  // 초당 원하는 프레임
    var OPACITY = 0.97;

    var defaulColorScale = [
        "rgb(36,104, 180)",
        "rgb(60,157, 194)",
        "rgb(128,205,193 )",
        "rgb(151,218,168 )",
        "rgb(198,231,181)",
        "rgb(238,247,217)",
        "rgb(255,238,159)",
        "rgb(252,217,125)",
        "rgb(255,182,100)",
        "rgb(252,150,75)",
        "rgb(250,112,52)",
        "rgb(245,64,32)",
        "rgb(237,45,28)",
        "rgb(220,24,32)",
        "rgb(180,0,35)"
    ];

    const colorScale = params.colorScale || defaulColorScale;

    var NULL_WIND_VECTOR = [NaN, NaN, null]; // 바람이 없는 싱글톤 형식: [u, v, magnitude]

    var builder;
    var grid;
    var gridData = params.data;
    var date;
    var λ0, φ0, Δλ, Δφ, ni, nj;

    var setData = function(data) {
        gridData = data;
    };

    var setOptions = function(options) {
        if (options.hasOwnProperty("minVelocity"))
            MIN_VELOCITY_INTENSITY = options.minVelocity;

        if (options.hasOwnProperty("maxVelocity"))
            MAX_VELOCITY_INTENSITY = options.maxVelocity;

        if (options.hasOwnProperty("velocityScale"))
            VELOCITY_SCALE =
                (options.velocityScale || 0.005) *
                (Math.pow(window.devicePixelRatio, 1 / 3) || 1);

        if (options.hasOwnProperty("particleAge"))
            MAX_PARTICLE_AGE = options.particleAge;

        if (options.hasOwnProperty("lineWidth"))
            PARTICLE_LINE_WIDTH = options.lineWidth;

        if (options.hasOwnProperty("particleMultiplier"))
            PARTICLE_MULTIPLIER = options.particleMultiplier;

        if (options.hasOwnProperty("opacity")) OPACITY = +options.opacity;

        if (options.hasOwnProperty("frameRate")) FRAME_RATE = options.frameRate;
        FRAME_TIME = 1000 / FRAME_RATE;
    };

    // 바람(u,v,m)과 같은 벡터에 대한 보간
    var bilinearInterpolateVector = function(x, y, g00, g10, g01, g11) {
        var rx = 1 - x;
        var ry = 1 - y;
        var a = rx * ry,
            b = x * ry,
            c = rx * y,
            d = x * y;
        var u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
        var v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
        return [u, v, Math.sqrt(u * u + v * v)];
    };

    var createWindBuilder = function(uComp, vComp) {
        var uData = uComp.data,
            vData = vComp.data;
        return {
            header: uComp.header,
            //recipe: recipeFor("wind-" + uComp.header.surface1Value),
            data: function(i) {
                return [uData[i], vData[i]];
            },
            interpolate: bilinearInterpolateVector
        };
    };

    var createBuilder = function(data) {
        var uComp = null,
            vComp = null,
            scalar = null;

        data.forEach(function(record) {
            switch (
            record.header.parameterCategory +
            "," +
            record.header.parameterNumber
                ) {
                case "1,2":
                case "2,2":
                    uComp = record;
                    break;
                case "1,3":
                case "2,3":
                    vComp = record;
                    break;
                default:
                    scalar = record;
            }
        });

        return createWindBuilder(uComp, vComp);
    };

    var buildGrid = function(data, callback) {
        var supported = true;

        if (data.length < 2 ) supported = false;
        if (!supported) console.log("Windy Error: data must have at least two components (u,v)");

        builder = createBuilder(data);
        var header = builder.header;

        if (header.hasOwnProperty("gridDefinitionTemplate") && header.gridDefinitionTemplate != 0 ) supported = false;
        if (!supported) {
            console.log("Windy Error: Only data with Latitude_Longitude coordinates is supported");
        }
        supported = true;  // 향후 확인을 위해 재설정

        λ0 = header.lo1;
        φ0 = header.la1; // 그리드의 원점(예: 0.0E, 90.0N)

        Δλ = header.dx;
        Δφ = header.dy; // 그리드 점 사이의 거리(예: 2.5deg lon, 2.5deg lat)

        ni = header.nx;
        nj = header.ny; // 그리드 점 WE 및 NS의 수(예: 144 x 73)

        if (header.hasOwnProperty("scanMode")) {
            var scanModeMask = header.scanMode.toString(2)
            scanModeMask = ('0'+scanModeMask).slice(-8);
            var scanModeMaskArray = scanModeMask.split('').map(Number).map(Boolean);

            if (scanModeMaskArray[0]) Δλ =-Δλ;
            if (scanModeMaskArray[1]) Δφ = -Δφ;
            if (scanModeMaskArray[2]) supported = false;
            if (scanModeMaskArray[3]) supported = false;
            if (scanModeMaskArray[4]) supported = false;
            if (scanModeMaskArray[5]) supported = false;
            if (scanModeMaskArray[6]) supported = false;
            if (scanModeMaskArray[7]) supported = false;
            if (!supported) console.log("Windy Error: Data with scanMode: "+header.scanMode+ " is not supported.");
        }
        date = new Date(header.refTime);
        date.setHours(date.getHours() + header.forecastTime);

        // Scan modes 0, 64 allowed.
        // http://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_table3-4.shtml
        grid = [];
        var p = 0;
        var isContinuous = Math.floor(ni * Δλ) >= 360;

        for (var j = 0; j < nj; j++) {
            var row = [];
            for (var i = 0; i < ni; i++, p++) {
                row[i] = builder.data(p);
            }
            if (isContinuous) {
                // 래핑된 그리드의 경우 첫 번째 열을 마지막 열로 복제하여 보간 논리를 단순화합니다.
                row.push(row[0]);
            }
            grid[j] = row;
        }

        callback({
            date: date,
            interpolate: interpolate
        });
    };

    /**
     * Lon/Lat 위치에서 보간된 그리드 값 가져오기
     * @param λ {Float} Longitude
     * @param φ {Float} Latitude
     * @returns {Object}
     */
    var interpolate = function(λ, φ) {
        if (!grid) return null;

        var i = floorMod(λ - λ0, 360) / Δλ; // 래핑된 범위 [0, 360)에서 경도 인덱스를 계산합니다.
        var j = (φ0 - φ) / Δφ; // +90에서 -90 방향의 위도 인덱스를 계산합니다.

        var fi = Math.floor(i),
            ci = fi + 1;
        var fj = Math.floor(j),
            cj = fj + 1;

        var row;
        if ((row = grid[fj])) {
            var g00 = row[fi];
            var g10 = row[ci];
            if (isValue(g00) && isValue(g10) && (row = grid[cj])) {
                var g01 = row[fi];
                var g11 = row[ci];
                if (isValue(g01) && isValue(g11)) {
                    // 4개의 점을 모두 찾았으므로 값을 보간합니다.
                    return builder.interpolate(i - fi, j - fj, g00, g10, g01, g11);
                }
            }
        }
        return null;
    };

    /**
     * @returns {Boolean} 지정된 값이 null이 아니고 정의되지 않은 경우 참입니다
     */
    var isValue = function(x) {
        return x !== null && x !== undefined;
    };

    /**
     * @returns {Number} 는 바닥 나눗셈의 나머지, 즉 floor(a / n)을 반환합니다. 일관된 모듈로에 유용
     * 음수. http://en.wikipedia.org/wiki/Modulo_operation을 참조하십시오.
     */
    var floorMod = function(a, n) {
        return a - n * Math.floor(a / n);
    };

    /**
     * @returns {Number} [낮음, 높음] 범위로 고정된 값 x.
     */
    var clamp = function(x, range) {
        return Math.max(range[0], Math.min(x, range[1]));
    };

    /**
     * @returns {Boolean}에이전트가 모바일 장치인 경우 true입니다. 이것이 정확한지 상관하지 마십시오.
     */
    var isMobile = function() {
        return /android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i.test(
            navigator.userAgent
        );
    };

    /**
     * 점 (x, y)에서 투영의 모양으로 인해 발생하는 바람 벡터의 왜곡을 계산합니다. 바람
     * 벡터는 제자리에서 수정되고 이 함수에 의해 반환됩니다.
     */
    var distort = function(projection, λ, φ, x, y, scale, wind) {
        var u = wind[0] * scale;
        var v = wind[1] * scale;
        var d = distortion(projection, λ, φ, x, y);

        // 왜곡 벡터를 u와 v로 조정한 다음 더합니다.
        wind[0] = d[0] * u + d[2] * v;
        wind[1] = d[1] * u + d[3] * v;
        return wind;
    };

    var distortion = function(projection, λ, φ, x, y) {
        var τ = 2 * Math.PI;
        //    var H = Math.pow(10, -5.2); // 0.00000630957344480193
        //    var H = 0.0000360;          // 0.0000360°φ ~= 4m  (from https://github.com/cambecc/earth/blob/master/public/libs/earth/1.0.0/micro.js#L13)
        var H = 5; // ToDo:   Why does this work?
        var hλ = λ < 0 ? H : -H;
        var hφ = φ < 0 ? H : -H;

        var pλ = project(φ, λ + hλ);
        var pφ = project(φ + hφ, λ);

        // Meridian scale factor (see Snyder, equation 4-3), where R = 1. This handles issue where length of 1º λ
        // changes depending on φ. Without this, there is a pinching effect at the poles.
        var k = Math.cos((φ / 360) * τ);
        return [
            (pλ[0] - x) / hλ / k,
            (pλ[1] - y) / hλ / k,
            (pφ[0] - x) / hφ,
            (pφ[1] - y) / hφ
        ];
    };

    var createField = function(columns, bounds, callback) {
        /**
         * @returns {Array} wind vector [u, v, magnitude] at the point (x, y), or [NaN, NaN, null] if wind
         *          is undefined at that point.
         */
        function field(x, y) {
            var column = columns[Math.round(x)];
            return (column && column[Math.round(y)]) || NULL_WIND_VECTOR;
        }

        // Frees the massive "columns" array for GC. Without this, the array is leaked (in Chrome) each time a new
        // field is interpolated because the field closure's context is leaked, for reasons that defy explanation.
        field.release = function() {
            columns = [];
        };

        field.randomize = function(o) {
            // UNDONE: this method is terrible
            var x, y;
            var safetyNet = 0;
            do {
                x = Math.round(Math.floor(Math.random() * bounds.width) + bounds.x);
                y = Math.round(Math.floor(Math.random() * bounds.height) + bounds.y);
            } while (field(x, y)[2] === null && safetyNet++ < 30);
            o.x = x;
            o.y = y;
            return o;
        };

        callback(bounds, field);
    };

    var buildBounds = function(bounds, width, height) {
        var upperLeft = bounds[0];
        var lowerRight = bounds[1];
        var x = Math.round(upperLeft[0]); //Math.max(Math.floor(upperLeft[0], 0), 0);
        var y = Math.max(Math.floor(upperLeft[1], 0), 0);
        var xMax = Math.min(Math.ceil(lowerRight[0], width), width - 1);
        var yMax = Math.min(Math.ceil(lowerRight[1], height), height - 1);
        return {
            x: x,
            y: y,
            xMax: width,
            yMax: yMax,
            width: width,
            height: height
        };
    };

    var deg2rad = function(deg) {
        return (deg / 180) * Math.PI;
    };

    var invert = function(x, y, windy) {
        var latlon = params.map.containerPointToLatLng(L.point(x, y));
        return [latlon.lng, latlon.lat];
    };

    var project = function(lat, lon, windy) {
        var xy = params.map.latLngToContainerPoint(L.latLng(lat, lon));
        return [xy.x, xy.y];
    };

    var interpolateField = function(grid, bounds, extent, callback) {
        var projection = {}; // map.crs used instead
        var mapArea = (extent.south - extent.north) * (extent.west - extent.east);
        var velocityScale = VELOCITY_SCALE * Math.pow(mapArea, 0.4);

        var columns = [];
        var x = bounds.x;

        function interpolateColumn(x) {
            var column = [];
            for (var y = bounds.y; y <= bounds.yMax; y += 2) {
                var coord = invert(x, y);
                if (coord) {
                    var λ = coord[0],
                        φ = coord[1];
                    if (isFinite(λ)) {
                        var wind = grid.interpolate(λ, φ);
                        if (wind) {
                            wind = distort(projection, λ, φ, x, y, velocityScale, wind);
                            column[y + 1] = column[y] = wind;
                        }
                    }
                }
            }
            columns[x + 1] = columns[x] = column;
        }

        (function batchInterpolate() {
            var start = Date.now();
            while (x < bounds.width) {
                interpolateColumn(x);
                x += 2;
                if (Date.now() - start > 1000) {
                    //MAX_TASK_TIME) {
                    setTimeout(batchInterpolate, 25);
                    return;
                }
            }
            createField(columns, bounds, callback);
        })();
    };

    var animationLoop;
    var animate = function(bounds, field) {
        function windIntensityColorScale(min, max) {
            colorScale.indexFor = function(m) {
                // map velocity speed to a style
                return Math.max(
                    0,
                    Math.min(
                        colorScale.length - 1,
                        Math.round(((m - min) / (max - min)) * (colorScale.length - 1))
                    )
                );
            };

            return colorScale;
        }

        var colorStyles = windIntensityColorScale(
            MIN_VELOCITY_INTENSITY,
            MAX_VELOCITY_INTENSITY
        );
        var buckets = colorStyles.map(function() {
            return [];
        });

        var particleCount = Math.round(
            bounds.width * bounds.height * PARTICLE_MULTIPLIER
        );
        if (isMobile()) {
            particleCount *= PARTICLE_REDUCTION;
        }

        var fadeFillStyle = `rgba(0, 0, 0, ${OPACITY})`;

        var particles = [];
        for (var i = 0; i < particleCount; i++) {
            particles.push(
                field.randomize({
                    age: Math.floor(Math.random() * MAX_PARTICLE_AGE) + 0
                })
            );
        }

        function evolve() {
            buckets.forEach(function(bucket) {
                bucket.length = 0;
            });
            particles.forEach(function(particle) {
                if (particle.age > MAX_PARTICLE_AGE) {
                    field.randomize(particle).age = 0;
                }
                var x = particle.x;
                var y = particle.y;
                var v = field(x, y); // vector at current position
                var m = v[2];
                if (m === null) {
                    particle.age = MAX_PARTICLE_AGE; // particle has escaped the grid, never to return...
                } else {
                    var xt = x + v[0];
                    var yt = y + v[1];
                    if (field(xt, yt)[2] !== null) {
                        // Path from (x,y) to (xt,yt) is visible, so add this particle to the appropriate draw bucket.
                        particle.xt = xt;
                        particle.yt = yt;
                        buckets[colorStyles.indexFor(m)].push(particle);
                    } else {
                        // Particle isn't visible, but it still moves through the field.
                        particle.x = xt;
                        particle.y = yt;
                    }
                }
                particle.age += 1;
            });
        }

        var g = params.canvas.getContext("2d");
        g.lineWidth = PARTICLE_LINE_WIDTH;
        g.fillStyle = fadeFillStyle;
        g.globalAlpha = 0.6;

        function draw() {
            // Fade existing particle trails.
            var prev = "lighter";
            g.globalCompositeOperation = "destination-in";
            g.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            g.globalCompositeOperation = prev;
            g.globalAlpha = OPACITY === 0 ? 0 : OPACITY * 0.9;

            // Draw new particle trails.
            buckets.forEach(function(bucket, i) {
                if (bucket.length > 0) {
                    g.beginPath();
                    g.strokeStyle = colorStyles[i];
                    bucket.forEach(function(particle) {
                        g.moveTo(particle.x, particle.y);
                        g.lineTo(particle.xt, particle.yt);
                        particle.x = particle.xt;
                        particle.y = particle.yt;
                    });
                    g.stroke();
                }
            });
        }

        var then = Date.now();
        (function frame() {
            animationLoop = requestAnimationFrame(frame);
            var now = Date.now();
            var delta = now - then;
            if (delta > FRAME_TIME) {
                then = now - (delta % FRAME_TIME);
                evolve();
                draw();
            }
        })();
    };

    var start = function(bounds, width, height, extent) {
        var mapBounds = {
            south: deg2rad(extent[0][1]),
            north: deg2rad(extent[1][1]),
            east: deg2rad(extent[1][0]),
            west: deg2rad(extent[0][0]),
            width: width,
            height: height
        };

        stop();

        // build grid
        buildGrid(gridData, function(grid) {
            // interpolateField
            interpolateField(
                grid,
                buildBounds(bounds, width, height),
                mapBounds,
                function(bounds, field) {
                    // animate the canvas with random points
                    windy.field = field;
                    animate(bounds, field);
                }
            );
        });
    };

    var stop = function() {
        if (windy.field) windy.field.release();
        if (animationLoop) cancelAnimationFrame(animationLoop);
    };

    var windy = {
        params: params,
        start: start,
        stop: stop,
        createField: createField,
        interpolatePoint: interpolate,
        setData: setData,
        setOptions: setOptions
    };

    return windy;
};

if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = function(id) {
        clearTimeout(id);
    };
}