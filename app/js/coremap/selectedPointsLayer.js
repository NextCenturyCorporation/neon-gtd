'use strict';
/*
 * Copyright 2015 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

coreMap.Map.Layer = coreMap.Map.Layer || {};

/**
 * This module extend an OpenLayers 2 Vector Layer to create a map layer of points displayed as stars.
 *
 * @namespace coreMap.Map.Layer
 * @class SelectedPointsLayer
 * @constructor
 */
coreMap.Map.Layer.SelectedPointsLayer = OpenLayers.Class(OpenLayers.Layer.Vector, {
    CLASS_NAME: "coreMap.Map.Layer.SelectedPointsLayer",

    initialize: function(name, options) {
        var extendOptions = options || {};
        extendOptions.styleMap = new OpenLayers.StyleMap({
            default: {
                graphicName: coreMap.Map.Layer.SelectedPointsLayer.DEFAULT_GRAPHIC,
                strokeOpacity: coreMap.Map.Layer.SelectedPointsLayer.DEFAULT_STROKE_OPACITY,
                strokeWidth: coreMap.Map.Layer.SelectedPointsLayer.DEFAULT_STROKE_WIDTH,
                fillColor: coreMap.Map.Layer.SelectedPointsLayer.DEFAULT_FILL_COLOR,
                fillOpacity: coreMap.Map.Layer.SelectedPointsLayer.DEFAULT_FILL_OPACITY,
                pointRadius: coreMap.Map.Layer.SelectedPointsLayer.DEFAULT_POINT_RADIUS
            }
        });
        OpenLayers.Layer.Vector.prototype.initialize.apply(this, [name, extendOptions]);
        this.visibility = true;
    }
});

coreMap.Map.Layer.SelectedPointsLayer.DEFAULT_GRAPH = "star";
coreMap.Map.Layer.SelectedPointsLayer.DEFAULT_STROKE_OPACITY = 0.8;
coreMap.Map.Layer.SelectedPointsLayer.DEFAULT_STROKE_WIDTH = 1;
coreMap.Map.Layer.SelectedPointsLayer.DEFAULT_FILL_COLOR = "#FFA500";
coreMap.Map.Layer.SelectedPointsLayer.DEFAULT_FILL_OPACITY = 0.8;
coreMap.Map.Layer.SelectedPointsLayer.DEFAULT_POINT_RADIUS = 10;
