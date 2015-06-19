'use strict';
/*
 * Copyright 2014 Next Century Corporation
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

/**
 * This Angular JS directive adds a map to a page and has controls for selecting which data available through
 * a Neon connection should be plotted.
 *
 * @example
 *    &lt;heat-map&gt;&lt;/heat-map&gt;<br>
 *    &lt;div heat-map&gt;&lt;/div&gt;
 *
 * @namespace neonDemo.directives
 * @class map
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('map', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', '$timeout', function(connectionService, datasetService, errorNotificationService, filterService, $timeout) {
    return {
        templateUrl: 'partials/directives/map.html',
        restrict: 'EA',
        scope: {
            bindLatitudeField: '=',
            bindLongitudeField: '=',
            bindColorField: '=',
            bindSizeField: '=',
            bindTable: '=',
            bindDatabase: '=',
            // map of categories to colors used for the legend
            colorMappings: '&',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            $element.addClass('map-container');

            $scope.element = $element;

            $scope.optionsMenuButtonText = function() {
                var limits = Object.keys($scope.limitedLayers);
                var text = "";
                if(limits.length) {
                    for(var i = 0; i < limits.length; ++i) {
                        var limitedLayers = $scope.limitedLayers[limits[i]];
                        if(limitedLayers.length) {
                            text += text ? "; " : "";
                            for(var j = 0; j < limitedLayers.length; ++j) {
                                text += (j ? ", " + limitedLayers[j] : limitedLayers[j]);
                            }
                            text += " limit " + limits[i];
                        }
                    }
                }
                return text;
                /*
                if($scope.dataLength >= $scope.previousLimit) {
                    return $scope.previousLimit + " data limit";
                }
                return "";
                */
            };
            $scope.showOptionsMenuButtonText = function() {
                return Object.keys($scope.limitedLayers).length > 0;
                //return $scope.dataLength >= $scope.previousLimit;
            };

            $scope.layersByDatabaseAndTable = {};
            $scope.limitedLayers = {};

            // Setup scope variables.
            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.cacheMap = false;
            $scope.filterKeys = {};
            $scope.showFilter = false;
            $scope.dataBounds = undefined;
            $scope.dataLength = 0;
            $scope.resizeRedrawDelay = 1500; // Time in ms to wait after a resize event flood to try redrawing the map.
            $scope.errorMessage = undefined;
            $scope.loadingData = false;

            $scope.options = {
                layers: [],
                database: "",
                table: "",
                latitudeField: "",
                longitudeField: "",
                sizeByField: "",
                colorByField: "",
                showPoints: true, // Default to the points view.
                limit: 1000
            };

            $scope.previousLimit = $scope.options.limit;

            // Setup our map.
            $scope.mapId = uuid();
            $element.append('<div id="' + $scope.mapId + '" class="map"></div>');
            $scope.map = new coreMap.Map($scope.mapId, {
                responsive: false
            });

            /**
             * Returns the list of tables for which we currently have layers.
             * This method attempts to flatten duplicates so we only query tables once for
             * multiple layers that reference them.
             * @return {Array<string>}
             */
            var getLayerDatabaseTableSets = function() {
                var sets = [];
                for(var i = 0; i < $scope.options.layers.length; i++) {
                    if(!sets[$scope.options.layers[i].database]) {
                        sets[$scope.options.layers[i].database] = [];
                    }
                    if(!_.contains(sets[$scope.options.layers[i].database], $scope.options.layers[i].table)) {
                        sets[$scope.options.layers[i].database].push($scope.options.layers[i].table);
                    }
                }
                return sets;
            };

            /**
             * Triggers a data query against any table displayed in a current map layer.
             */
            var queryAllLayerTables = function() {
                var sets = getLayerDatabaseTableSets();
                var keys = _.keys(sets);
                var tables = [];
                for(var i = 0; i < keys.length; i++) {
                    tables = sets[keys[i]];
                    for(var j = 0; j < tables.length; j++) {
                        $scope.queryForMapData(keys[i], tables[j]);
                    }
                }
            };

            /**
             * Initializes the name of the directive's scope variables
             * and the Neon Messenger used to monitor data change events.
             * @method initialize
             */
            $scope.initialize = function() {
                $scope.draw();
                $scope.map.register("movestart", this, onMapEvent);
                $scope.map.register("moveend", this, onMapEvent);
                $scope.map.register("zoom", this, onMapEvent);
                $scope.map.register("zoomend", this, onMapEvent);

                // Setup our messenger.
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "map",
                        elementType: "canvas",
                        elementSub: "map",
                        elementGroup: "map_group",
                        source: "user",
                        tags: ["remove", "map"]
                    });
                    $element.off("resize", updateSize);
                    $scope.messenger.removeEvents();
                    if($scope.showFilter) {
                        $scope.clearFilters();
                    }
                });

                // Enable the tooltips.
                $($element).find('label.btn-default').tooltip();

                // Handle toggling map caching.
                $scope.$watch('cacheMap', function(newVal, oldVal) {
                    XDATA.userALE.log({
                        activity: "select",
                        action: "click",
                        elementId: "map-cache",
                        elementType: "checkbox",
                        elementSub: "map-cache",
                        elementGroup: "map_group",
                        source: "user",
                        tags: ["options", "map", "tile-cache"]
                    });
                    if(newVal !== oldVal) {
                        if(newVal) {
                            $scope.map.clearCache();
                            $scope.map.toggleCaching();
                        } else {
                            $scope.map.toggleCaching();
                        }
                    }
                });

                // Setup a basic resize handler to redraw the map and calculate its size if our div changes.
                // Since the map redraw can take a while and resize events can come in a flood, we attempt to
                // redraw only after a second of no consecutive resize events.
                var redrawOnResize = function() {
                    $scope.map.resizeToElement();
                    $scope.resizePromise = null;
                };

                var updateSize = function() {
                    if($scope.resizePromise) {
                        $timeout.cancel($scope.resizePromise);
                    }
                    $scope.resizePromise = $timeout(redrawOnResize, $scope.resizeRedrawDelay);
                };

                $element.resize(updateSize);

                // Add a zoomRect handler to the map.
                $scope.map.onZoomRect = function(bounds) {
                    $scope.extent = boundsToExtent(bounds);

                    XDATA.userALE.log({
                        activity: "select",
                        action: "drag",
                        elementId: "map",
                        elementType: "canvas",
                        elementSub: "geo-filter",
                        elementGroup: "map_group",
                        source: "user",
                        tags: ["map", "filter"]
                    });
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "filter",
                        elementId: "map",
                        elementType: "canvas",
                        elementSub: "map",
                        elementGroup: "map_group",
                        source: "system",
                        tags: ["filter", "map"]
                    });

                    var activeLayers = [];
                    for(var i = 0; i < $scope.options.layers.length; i++) {
                        if($scope.options.layers[i].active) {
                            activeLayers.push($scope.options.layers[i]);
                        }
                    }
                    filterActiveLayersRecursively(activeLayers, function() {
                        $scope.$apply(function() {
                            queryAllLayerTables();
                            drawZoomRect({
                                left: $scope.extent.minimumLongitude,
                                bottom: $scope.extent.minimumLatitude,
                                right: $scope.extent.maximumLongitude,
                                top: $scope.extent.maximumLatitude
                            });

                            // Show the Clear Filter button.
                            $scope.showFilter = true;
                            $scope.error = "";
                            XDATA.userALE.log({
                                activity: "alter",
                                action: "filter",
                                elementId: "map",
                                elementType: "canvas",
                                elementSub: "map-filter-box",
                                elementGroup: "map_group",
                                source: "system",
                                tags: ["render", "map"]
                            });
                        });
                    });
                };
            };

            /**
             * This method will apply filters to all actively filtering layers and trigger a single
             * callback after all filters have been applied.
             * @method addFiltersForLayer
             * @private
             */
            var filterActiveLayersRecursively = function(activeLayers, callback) {
                var layer = activeLayers.shift();
                var relations = datasetService.getRelations(layer.database, layer.table, [layer.latitudeMapping, layer.longitudeMapping]);
                filterService.replaceFilters($scope.messenger, relations, layer.filterKeys, $scope.createFilterClauseForExtent, function() {
                    if(activeLayers.length) {
                        filterActiveLayersRecursively(activeLayers, callback);
                    } else {
                        if(callback) {
                            callback();
                        }
                    }
                }, function() {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "failed",
                        elementId: "map",
                        elementType: "canvas",
                        elementSub: "map",
                        elementGroup: "map_group",
                        source: "system",
                        tags: ["failed", "map", "filter"]
                    });
                    // Notify the user of the error.
                    $scope.error = "Error: Failed to create filter.";
                });
            };

            /**
             * This method will apply filters to a particular layer.
             * @method addFiltersForLayer
             * @private
             */
            var addFiltersForLayer = function(layer) {
                var relations = datasetService.getRelations(layer.database, layer.table, [layer.latitudeMapping, layer.longitudeMapping]);
                filterService.replaceFilters($scope.messenger, relations, layer.filterKeys, $scope.createFilterClauseForExtent, function() {
                    $scope.$apply(function() {
                        // TODO: Need a way to defer this so we don't reload everything
                        // for every filtering layer and related filter.
                        queryAllLayerTables();
                        drawZoomRect({
                            left: $scope.extent.minimumLongitude,
                            bottom: $scope.extent.minimumLatitude,
                            right: $scope.extent.maximumLongitude,
                            top: $scope.extent.maximumLatitude
                        });

                        // Show the Clear Filter button.
                        $scope.showFilter = true;
                        $scope.error = "";
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "filter",
                            elementId: "map",
                            elementType: "canvas",
                            elementSub: "map-filter-box",
                            elementGroup: "map_group",
                            source: "system",
                            tags: ["render", "map"]
                        });
                    });
                }, function() {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "failed",
                        elementId: "map",
                        elementType: "canvas",
                        elementSub: "map",
                        elementGroup: "map_group",
                        source: "system",
                        tags: ["failed", "map", "filter"]
                    });
                    // Notify the user of the error.
                    $scope.error = "Error: Failed to create filter.";
                });
            };

            /**
             * A simple handler for emitting USER-ALE messages from common user events on a map.
             * @method onMapEvent
             * @private
             */
            var onMapEvent = function(message) {
                var type = message.type;
                type = type.replace("move", "pan");
                type = type.replace("zoomend", "zoom");

                XDATA.userALE.log({
                    activity: "alter",
                    action: type,
                    elementId: "map",
                    elementType: "canvas",
                    elementSub: "map-viewport",
                    elementGroup: "map_group",
                    source: "user",
                    tags: ["map", "viewport"]
                });
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "map",
                    elementType: "canvas",
                    elementSub: "map",
                    elementGroup: "map_group",
                    source: "system",
                    tags: ["filter-change", "map"]
                });
                if(message.addedFilter && message.addedFilter.databaseName && message.addedFilter.tableName) {
                    $scope.queryForMapData(message.addedFilter.databaseName, message.addedFilter.tableName);
                }
                if(message.removedFilter && message.removedFilter.databaseName && message.removedFilter.tableName) {
                    $scope.queryForMapData(message.removedFilter.databaseName, message.removedFilter.tableName);
                }
            };

            var boundsToExtent = function(bounds) {
                var llPoint = new OpenLayers.LonLat(bounds.left, bounds.bottom);
                var urPoint = new OpenLayers.LonLat(bounds.right, bounds.top);

                var minLon = Math.min(llPoint.lon, urPoint.lon);
                var maxLon = Math.max(llPoint.lon, urPoint.lon);

                var minLat = Math.min(llPoint.lat, urPoint.lat);
                var maxLat = Math.max(llPoint.lat, urPoint.lat);

                return {
                    minimumLatitude: minLat,
                    minimumLongitude: minLon,
                    maximumLatitude: maxLat,
                    maximumLongitude: maxLon
                };
            };

            var clearZoomRect = function() {
                if($scope.zoomRectId !== undefined) {
                    $scope.map.removeBox($scope.zoomRectId);
                    $scope.zoomRectId = undefined;
                }
            };

            var cloneDatasetLayerConfig = function() {
                var configClone = [];
                var config = datasetService.getMapLayers() || [];
                for(var i = 0; i < config.length; i++) {
                    configClone.push(_.clone(config[i]));
                }
                return configClone;
            };

            var createLayersByDatabaseAndTableMap = function(layers) {
                var map = {};
                for(var i = 0; i < layers.length; ++i) {
                    var database = layers[i].database;
                    var table = layers[i].table;
                    if(!map[database]) {
                        map[database] = {};
                    }
                    // TODO:  We currently use the limit of the first layer for each database/table pair.  We need to determine a better way of structuring the configuration.
                    if(!map[database][table]) {
                        map[database][table] = {
                            names: [],
                            limit: layers[i].limit
                        };
                    }

                    if(!(map[database][table].limit)) {
                        map[database][table].limit = layers[i].limit;
                    }

                    map[database][table].names.push(layers[i].name);
                }
                return map;
            };

            var drawZoomRect = function(rect) {
                // Clear the old rect.
                clearZoomRect();

                // Draw the new rect
                if(rect !== undefined) {
                    $scope.zoomRectId = $scope.map.drawBox(rect);
                }
            };

            $scope.clearLayers = function() {
                if($scope.options.layers) {
                    for(var i = 0; i < $scope.options.layers.length; i++) {
                        if($scope.options.layers[i].olLayer) {
                            $scope.map.removeLayer($scope.options.layers[i].olLayer);
                            $scope.options.layers[i].olLayer = undefined;
                        }
                    }
                    $scope.options.layers = [];
                }
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             */
            $scope.displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset() || $scope.loadingData) {
                    return;
                }

                // Clear the zoom Rect from the map before reinitializing it.
                clearZoomRect();

                $scope.dataBounds = undefined;
                $scope.hideClearFilterButton();

                // Call removeLayer on all existing layers.
                $scope.clearLayers();

                // Reconfigure the map as necessary.
                var mapConfig = datasetService.getMapConfig();
                if(mapConfig && mapConfig.bounds) {
                    $scope.map.zoomToBounds(mapConfig.bounds);
                } else {
                    $scope.map.zoomToBounds({
                        left: -180,
                        bottom: -90,
                        right: 180,
                        top: 90
                    });
                }

                if(initializing) {
                    $scope.updateLayersAndQueries();
                } else {
                    $scope.$apply(function() {
                        $scope.updateLayersAndQueries();
                    });
                }
            };

            /**
             * Updates the queries to support the current set of configured layers.
             */
            $scope.updateLayersAndQueries = function() {
                var i = 0;
                var layer = {};
                var name = "";

                $scope.options.layers = cloneDatasetLayerConfig();
                $scope.layersByDatabaseAndTable = createLayersByDatabaseAndTableMap($scope.options.layers);
                $scope.limitedLayers = {};

                // Setup the base layer objects.
                for(i = 0; i < $scope.options.layers.length; i++) {
                    layer = $scope.options.layers[i];
                    if(!layer.olLayer) {
                        if(layer.type === coreMap.Map.POINTS_LAYER) {
                            name = layer.name || layer.table + " Points";
                            layer.olLayer = new coreMap.Map.Layer.PointsLayer(name.toUpperCase(), {
                                latitudeMapping: layer.latitudeMapping,
                                longitudeMapping: layer.longitudeMapping,
                                sizeMapping: layer.sizeBy,
                                categoryMapping: layer.colorBy,
                                defaultColor: layer.defaultColor
                            });
                            this.map.addLayer(layer.olLayer);
                        } else if(layer.type === coreMap.Map.CLUSTER_LAYER) {
                            name = layer.name || layer.table + " Clusters";
                            layer.olLayer = new coreMap.Map.Layer.PointsLayer(name.toUpperCase(), {
                                latitudeMapping: layer.latitudeMapping,
                                longitudeMapping: layer.longitudeMapping,
                                sizeMapping: layer.sizeBy,
                                categoryMapping: layer.colorBy,
                                defaultColor: layer.defaultColor,
                                cluster: true
                            });
                            this.map.addLayer(layer.olLayer);
                        } else if(layer.type === coreMap.Map.HEATMAP_LAYER) {
                            name = layer.name || layer.table + " Heatmap";
                            layer.olLayer = new coreMap.Map.Layer.HeatmapLayer(name.toUpperCase(),
                                $scope.map.map,
                                $scope.map.map.baseLayer, {
                                latitudeMapping: layer.latitudeMapping,
                                longitudeMapping: layer.longitudeMapping,
                                sizeMapping: layer.sizeBy,
                                radius: 3,
                                minOpacity: 0.7,
                                maxOpacity: 1
                            });
                            this.map.addLayer(layer.olLayer);
                        }
                        layer.filterKeys = filterService.createFilterKeys("map", datasetService.getDatabaseAndTableNames());
                    }
                }

                // Make the necessary table queries.
                if($scope.showFilter) {
                    $scope.clearFilters(true);
                } else {
                    queryAllLayerTables();
                }
            };

            $scope.updateFieldsAndQueryForMapData = function() {
                // TODO:  Determine how to guarantee that loadingData is set to false once queries on all layers are finished.
                // $scope.loadingData = true;

                $timeout(function() {
                    $scope.updateLayersAndQueries();
                });
            };

            /**
             * @method queryForMapData
             */
            $scope.queryForMapData = function(database, table) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection) {
                    $scope.updateMapData(database, table, {
                        data: []
                    });
                    return;
                }

                var query = $scope.buildPointQuery(database, table);

                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "map",
                    elementType: "canvas",
                    elementSub: "map",
                    elementGroup: "map_group",
                    source: "system",
                    tags: ["query", "map"]
                });

                connection.executeQuery(query, function(queryResults) {
                    $scope.$apply(function() {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "receive",
                            elementId: "map",
                            elementType: "canvas",
                            elementSub: "map",
                            elementGroup: "map_group",
                            source: "system",
                            tags: ["receive", "map"]
                        });
                        $scope.updateMapData(database, table, queryResults);

                        XDATA.userALE.log({
                            activity: "alter",
                            action: "render",
                            elementId: "map",
                            elementType: "canvas",
                            elementSub: "map",
                            elementGroup: "map_group",
                            source: "system",
                            tags: ["render", "map"]
                        });
                    });
                }, function(response) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "failed",
                        elementId: "map",
                        elementType: "canvas",
                        elementSub: "map",
                        elementGroup: "map_group",
                        source: "system",
                        tags: ["failed", "map"]
                    });
                    $scope.updateMapData(database, table, {
                        data: []
                    });
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            /**
             * Redraws the map
             */
            $scope.draw = function() {
                $scope.map.draw();

                // color mappings need to be updated after drawing since they are set during drawing
                //$scope.colorMappings = $scope.map.getColorMappings();
                // TODO: Puzzle out where this goes when there's no longer 2 fixed layers.
                $scope.colorMappings = [];
            };

            /**
             * Updates the data bound to the map managed by this directive.  This will trigger a change in
             * the chart's visualization.
             * @param {Object} queryResults Results returned from a Neon query.
             * @param {Array} queryResults.data The aggregate numbers for the heat chart cells.
             * @method updateMapData
             */
            $scope.updateMapData = function(database, table, queryResults) {
                var data = queryResults.data;
                $scope.dataLength = data.length;
                for(var i = 0; i < $scope.options.layers.length; i++) {
                    if($scope.options.layers[i].database === database && $scope.options.layers[i].table === table && $scope.options.layers[i].olLayer) {
                        $scope.options.layers[i].olLayer.setData(queryResults.data);
                        $scope.options.layers[i].olLayer.updateFeatures();
                    }
                }

                var layers = findLayersByDatabaseAndTable(database, table);
                var index;
                if(data.length >= layers.limit) {
                    if(!$scope.limitedLayers[layers.limit]) {
                        $scope.limitedLayers[layers.limit] = [];
                    }
                    for(i = 0; i < layers.names.length; ++i) {
                        index = $scope.limitedLayers[layers.limit].indexOf(layers.names[i]);
                        if(index < 0) {
                            $scope.limitedLayers[layers.limit].push(layers.names[i]);
                        }
                    }
                } else if($scope.limitedLayers[layers.limit]) {
                    for(i = 0; i < layers.names.length; ++i) {
                        index = $scope.limitedLayers[layers.limit].indexOf(layers.names[i]);
                        if(index >= 0) {
                            $scope.limitedLayers[layers.limit].splice(index, 1);
                        }
                    }
                }

                $scope.draw();
            };

            /**
             * Zooms the map to the current data bounds
             */
            $scope.zoomToDataBounds = function() {
                $scope.map.zoomToBounds($scope.dataBounds);
            };

            /**
             * Computes the minimum bounding rect to bound the data
             * @param data
             */
            $scope.computeDataBounds = function(data) {
                if(data.length === 0) {
                    return {
                        left: -180,
                        bottom: -90,
                        right: 180,
                        top: 90
                    };
                } else {
                    var minLon = 180;
                    var minLat = 90;
                    var maxLon = -180;
                    var maxLat = -90;
                    data.forEach(function(d) {
                        var lat = d[$scope.options.latitudeField];
                        var lon = d[$scope.options.longitudeField];
                        if($.isNumeric(lat) && $.isNumeric(lon)) {
                            if(lon < minLon) {
                                minLon = lon;
                            }
                            if(lon > maxLon) {
                                maxLon = lon;
                            }
                            if(lat < minLat) {
                                minLat = lat;
                            }
                            if(lat > maxLat) {
                                maxLat = lat;
                            }
                        }
                    });
                    return {
                        left: minLon,
                        bottom: minLat,
                        right: maxLon,
                        top: maxLat
                    };
                }
            };

            var findLayersByDatabaseAndTable = function(database, table) {
                var layers = {
                    names: [],
                    limit: undefined
                };

                if($scope.layersByDatabaseAndTable[database] && $scope.layersByDatabaseAndTable[database][table]) {
                    layers = $scope.layersByDatabaseAndTable[database][table];
                }

                if(!layers.limit) {
                    layers.limit = 1000;
                }

                return layers;
            };

            $scope.buildPointQuery = function(database, table) {
                var layers = findLayersByDatabaseAndTable(database, table);
                var query = new neon.query.Query().selectFrom(database, table).limit(layers.limit);
                return query;
            };

            $scope.hideClearFilterButton = function() {
                // hide the Clear Filter button.
                $scope.showFilter = false;
                $scope.error = "";
            };

            /**
             * Create and returns a filter using the given table and latitude/longitude field names using the extent set by the visualization..
             * @param {String} The name of the table on which to filter
             * @param {Array} An array containing the names of the latitude and longitude fields (as its first and second elements) on which to filter
             * @method createFilterClauseForExtent
             * @return {Object} A neon.query.Filter object
             */
            $scope.createFilterClauseForExtent = function(tableName, fieldNames) {
                var latitudeFieldName = fieldNames[0];
                var longitudeFieldName = fieldNames[1];

                var leftClause = neon.query.where(longitudeFieldName, ">=", $scope.extent.minimumLongitude);
                var rightClause = neon.query.where(longitudeFieldName, "<=", $scope.extent.maximumLongitude);
                var bottomClause = neon.query.where(latitudeFieldName, ">=", $scope.extent.minimumLatitude);
                var topClause = neon.query.where(latitudeFieldName, "<=", $scope.extent.maximumLatitude);

                //Deal with different dateline crossing scenarios.
                if($scope.extent.minimumLongitude < -180 && $scope.extent.maximumLongitude > 180) {
                    return neon.query.and(topClause, bottomClause);
                }

                if($scope.extent.minimumLongitude < -180) {
                    leftClause = neon.query.where(longitudeFieldName, ">=", $scope.extent.minimumLongitude + 360);
                    leftDateLine = neon.query.where(longitudeFieldName, "<=", 180);
                    rightDateLine = neon.query.where(longitudeFieldName, ">=", -180);
                    datelineClause = neon.query.or(neon.query.and(leftClause, leftDateLine), neon.query.and(rightClause, rightDateLine));
                    return neon.query.and(topClause, bottomClause, datelineClause);
                }

                if($scope.extent.maximumLongitude > 180) {
                    rightClause = neon.query.where(longitudeFieldName, "<=", $scope.extent.maximumLongitude - 360);
                    var rightDateLine = neon.query.where(longitudeFieldName, ">=", -180);
                    var leftDateLine = neon.query.where(longitudeFieldName, "<=", 180);
                    var datelineClause = neon.query.or(neon.query.and(leftClause, leftDateLine), neon.query.and(rightClause, rightDateLine));
                    return neon.query.and(topClause, bottomClause, datelineClause);
                }

                return neon.query.and(leftClause, rightClause, bottomClause, topClause);
            };

            /**
             * Clear Neon query filters set by the map.
             * @param {boolean} updateDisplay True, to update the map and layers after the filters are cleared;
             * false to simply clear the filters
             * @method clearFilter
             */
            $scope.clearFilters = function(updateLayers) {
                XDATA.userALE.log({
                    activity: "deselect",
                    action: "click",
                    elementId: "map",
                    elementType: "button",
                    elementSub: "geo-filter",
                    elementGroup: "map_group",
                    source: "user",
                    tags: ["map", "filter"]
                });

                XDATA.userALE.log({
                    activity: "alter",
                    action: "filter",
                    elementId: "map",
                    elementType: "canvas",
                    elementSub: "map",
                    elementGroup: "map_group",
                    source: "system",
                    tags: ["filter", "map"]
                });

                var layerFilterKeysList = [];
                for(var i = 0; i < $scope.options.layers.length; ++i) {
                    layerFilterKeysList.push($scope.options.layers[i].filterKeys);
                }

                // Update our table queries for the various layers.  Defer via recursion
                // until we've received responses from our filter requests.
                if(updateLayers) {
                    clearFiltersRecursively(layerFilterKeysList, function() {
                        clearZoomRect();
                        $scope.hideClearFilterButton();
                        queryAllLayerTables();
                    });
                } else {
                    clearFiltersRecursively(layerFilterKeysList);
                }
            };

            var clearFiltersRecursively = function(filterKeysList, callback) {
                var filterKeys = filterKeysList.shift();
                removeFiltersForKeys(filterKeys, function() {
                    if(filterKeysList.length) {
                        clearFiltersRecursively(filterKeysList, callback);
                    } else {
                        if(callback) {
                            callback();
                        }
                    }
                });
            };

            var removeFiltersForKeys = function(filterKeys, callback) {
                filterService.removeFilters($scope.messenger, filterKeys, function() {
                    XDATA.userALE.log({
                        activity: "deselect",
                        action: "filter",
                        elementId: "map",
                        elementType: "canvas",
                        elementSub: "map",
                        elementGroup: "map_group",
                        source: "system",
                        tags: ["filter", "map"]
                    });

                    if(callback) {
                        callback();
                    }
                }, function() {
                    XDATA.userALE.log({
                        activity: "deselect",
                        action: "failed",
                        elementId: "map",
                        elementType: "canvas",
                        elementSub: "map",
                        elementGroup: "map_group",
                        source: "system",
                        tags: ["filter", "map", "failed"]
                    });

                    // Notify the user of the error.
                    $scope.error = "Error: Failed to clear filter.";

                    if(callback) {
                        callback();
                    }
                });
            };

            /**
             * Sets the category mapping field used by the map for its layers.  This should be a top level
             * field in the data objects passed to the map.  If a non-truthy mapping is provided, the
             * @param String mapping
             * @method setMapCategoryMapping
             */
            $scope.setMapCategoryMapping = function(mapping) {
                if(mapping) {
                    $scope.map.categoryMapping = mapping;
                } else {
                    $scope.map.categoryMapping = undefined;
                }
            };

            $scope.handleLimitRefreshClick = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "map-limit-refresh-button",
                    elementType: "button",
                    elementGroup: "map_group",
                    source: "user",
                    tags: ["options", "map", "limit", $scope.options.limit]
                });

                $scope.previousLimit = $scope.options.limit;
                queryAllLayerTables();
            };

            $scope.updateFilteringOnLayer = function(layer) {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "click",
                    elementId: "map-layer-active-button",
                    elementType: "button",
                    elementGroup: "map_group",
                    source: "user",
                    tags: ["options", "map", "layer", layer.name, "active", layer.active]
                });

                if($scope.zoomRectId) {
                    if(layer.active) {
                        addFiltersForLayer(layer);
                    } else {
                        removeFiltersForKeys(layer.filterKeys, function() {
                            $scope.queryForMapData(layer.database, layer.table);
                        });
                    }
                }
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });

            var exportSuccess = function(queryResults) {
                /*XDATA.userALE.log({
                    activity: "",
                    action: "",
                    elementId: "",
                    elementType: "",
                    elementGroup: "",
                    source: "",
                    tags: ["", "", ""]
                });*/
                window.location.assign(queryResults.data);
            };

            var exportFail = function(response) {
                /*XDATA.userALE.log({
                    activity: "",
                    action: "",
                    elementId: "",
                    elementType: "",
                    elementGroup: "",
                    source: "",
                    tags: ["", "", ""]
                });*/
                if(response.responseJSON) {
                    $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                }
            };

            $scope.requestExport = function() {
                /*XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "map-export",
                    elementType: "button",
                    elementGroup: "map_group",
                    source: "user",
                    tags: ["options", "map", "export"]
                });*/
                var connection = connectionService.getActiveConnection();
                if(!connection) {
                    //This is temporary. Come up with better code for if there isn't a connection.
                    return;
                }
                var data = makeMapExportObject();
                // TODO replace hardcoded 'xlsx' with some sort of option variable.
                connection.executeExport(data, exportSuccess, exportFail, 'xlsx');
            };

            var makeMapExportObject = function() {
                var finalObject = {
                    name: "Map",
                    data: []
                };
                // This is very much like queryAllTableLayers(), except it stores the query built for each database/tablename pair
                // instead of calling queryForMapData() on them.
                var sets = getLayerDatabaseTableSets();
                var keys = _.keys(sets);
                var tables = [];
                for(var i = 0; i < keys.length; i++) {
                    tables = sets[keys[i]];
                    for(var j = 0; j < tables.length; j++) {
                        var query = $scope.buildPointQuery(keys[i], tables[j]);
                        // Set limitClause to undefined because we don't want to limit the number of matching results put into the CSV file.
                        query.limitClause = undefined;
                        var tempObject = {
                            query: query,
                            name: "map - " + keys[i] + "_" + tables[j],
                            fields: [],
                            ignoreFilters: query.ignoreFilters_,
                            selectionOnly: query.selectionOnly_,
                            ignoredFilterIds: query.ignoredFilterIds_,
                            type: "query"
                        };
                        for(var count = 0, fields = datasetService.getFields(keys[i], tables[j]); count < fields.length; count++) {
                            tempObject.fields.push({
                                query: fields[count].columnName,
                                pretty: fields[count].prettyName || fields[count].columnName
                            });
                        }
                        finalObject.data.push(tempObject);
                    }
                }
                return finalObject;
            };
        }
    };
}]);
