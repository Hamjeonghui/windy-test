/* 지도(Map) 생성 부분 */
var map = new ol.Map({
    target: 'map', // 지도영역 div의 id 입력
    layers: [
        new ol.layer.Tile({
            source: new ol.source.OSM() // Open Street Map
        })
    ],
    view: new ol.View({  // 지도의 어느 부분을 보여줄 것인지 설정
        center: ol.proj.fromLonLat([127.00169, 37.56421]), // 중심좌표 지도에 맞는 좌표계로 변환
        zoom: 6,
        enableRotation: false
    })
});