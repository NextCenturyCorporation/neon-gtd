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
 *    &lt;map&gt;&lt;/map&gt;<br>
 *    &lt;div map&gt;&lt;/div&gt;
 *
 * @namespace neonDemo.directives
 * @class map
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('map', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService', '$timeout',
    function(connectionService, datasetService, errorNotificationService, filterService, exportService, $timeout) {
    return {
        templateUrl: 'partials/directives/map.html',
        restrict: 'EA',
        scope: {
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
            };
            $scope.showOptionsMenuButtonText = function() {
                return Object.keys($scope.limitedLayers).length > 0;
            };

            $scope.limitedLayers = {};

            // Setup scope variables.
            $scope.cacheMap = false;
            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.filterKeys = {};
            $scope.showFilter = false;
            $scope.dataBounds = undefined;
            $scope.resizeRedrawDelay = 1500; // Time in ms to wait after a resize event flood to try redrawing the map.
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.selectedPointLayer = {};
            $scope.outstandingQuery = undefined;

            $scope.MAP_LAYER_TYPES = [coreMap.Map.POINTS_LAYER, coreMap.Map.CLUSTER_LAYER, coreMap.Map.HEATMAP_LAYER, coreMap.Map.NODE_LAYER];
            $scope.DEFAULT_LIMIT = 1000;
            $scope.DEFAULT_NEW_LAYER_TYPE = $scope.MAP_LAYER_TYPES[0];
            $scope.SELECTION_EVENT_CHANNEL = "QUERY_RESULTS_SELECTION_EVENT";

            $scope.options = {
                layers: [],
                newLayer: {
                    editing: false,
                    valid: false,
                    active: true,
                    visible: true,
                    database: {},
                    table: {},
                    name: "",
                    latitude: "",
                    longitude: "",
                    color: "",
                    size: "",
                    source: "",
                    target: "",
                    pointColor: "",
                    lineColor: "",
                    limit: $scope.DEFAULT_LIMIT,
                    type: $scope.DEFAULT_NEW_LAYER_TYPE
                }
            };

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
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    queryAllLayerTables();
                });
                $scope.messenger.subscribe($scope.SELECTION_EVENT_CHANNEL, $scope.createPoint);

                $scope.exportID = exportService.register($scope.makeMapExportObject);

                $scope.linkyConfig = datasetService.getLinkyConfig();

                $scope.messenger.subscribe('date_selected', onDateSelected);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: "map",
                        elementType: "canvas",
                        elementSub: "map",
                        elementGroup: "map_group",
                        source: "system",
                        tags: ["remove", "map"]
                    });
                    $element.off("resize", updateSize);
                    $scope.messenger.removeEvents();
                    if($scope.showFilter) {
                        $scope.clearFilters();
                    }
                    exportService.unregister($scope.exportID);
                });

                // Enable the tooltips.
                $($element).find('label.btn-default').tooltip();

                // Handle toggling map caching.
                $scope.$watch('cacheMap', function(newVal, oldVal) {
                    if(newVal !== oldVal) {
                        if(newVal) {
                            $scope.map.clearCache();
                            $scope.map.toggleCaching();
                        } else {
                            $scope.map.toggleCaching();
                        }
                    }
                });

                // Function on resize given to the options menu directive.
                $scope.resizeOptionsMenu = function() {
                    var container = $element.find(".menu-container");
                    // Make the height of the options menu match the height of the visualization below the header menu container.
                    var height = $element.height() - container.height() - container.css("top").replace("px", "") - 10;
                    // Make the width of the options menu match the width of the visualization.
                    var width = $element.width();

                    var popover = container.find(".popover-content");
                    popover.css("height", height + "px");
                    popover.css("width", width + "px");
                };

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

                    addFilters();
                };
            };

            /**
             * Adds the current map filter to all active map layers, queries for map data, and redraws the layers on the map.
             * @method addFilters
             * @private
             */
            var addFilters = function() {
                var activeLayers = [];
                for(var i = 0; i < $scope.options.layers.length; i++) {
                    if($scope.options.layers[i].active) {
                        activeLayers.push($scope.options.layers[i]);
                    }
                }

                if(activeLayers.length > 0) {
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
                }
            };

            /**
             * This method will apply filters to all actively filtering layers and trigger a single
             * callback after all filters have been applied.
             * @method filterActiveLayersRecursively
             * @private
             */
            var filterActiveLayersRecursively = function(activeLayers, callback) {
                var layer = activeLayers.shift();
                var relations = datasetService.getRelations(layer.database, layer.table, [layer.latitudeMapping, layer.longitudeMapping]);
                filterService.replaceFilters($scope.messenger, relations, layer.filterKeys, $scope.createFilterClauseForExtent, {
                    visName: "Map"
                }, function() {
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
            //jshint unused:false
            var addFiltersForLayer = function(layer) {
                //jshint unused:true
                var relations = datasetService.getRelations(layer.database, layer.table, [layer.latitudeMapping, layer.longitudeMapping]);
                filterService.replaceFilters($scope.messenger, relations, layer.filterKeys, $scope.createFilterClauseForExtent, {
                    visName: "Map"
                }, function() {
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

                if(type === "zoomend" && $scope.map.featurePopup) {
                    $scope.map.map.removePopup($scope.map.featurePopup);
                    $scope.map.featurePopup.destroy();
                    $scope.map.featurePopup = null;
                }

                // For convencience in analysing the user logs through user-ale,
                // move (move start, move, move end) and zoom (zoom end) events are renamed
                // here to match preferred testing nomenclature.
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
             * Event handler for date selected events issued over Neon's messaging channels.
             * @param {Object} message A Neon date selected message.
             * @method onDateSelected
             * @private
             */
            var onDateSelected = function(message) {
                //console.log(message);
                // Set a date range on any node layers to start.
                for(var i = 0; i < $scope.options.layers.length; i++) {
                    if($scope.options.layers[i].type === coreMap.Map.NODE_LAYER ||
                        $scope.options.layers[i].type === coreMap.Map.POINTS_LAYER) {
                        $scope.options.layers[i].olLayer.setDateFilter(message);
                    }
                }
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName && message.addedFilter.tableName) {
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
                    $scope.queryForMapData(message.addedFilter.databaseName, message.addedFilter.tableName);
                }
            };

            var boundsToExtent = function(bounds) {
                var lowerLeftPoint = new OpenLayers.LonLat(bounds.left, bounds.bottom);
                var upperRightPoint = new OpenLayers.LonLat(bounds.right, bounds.top);

                var minLon = Math.min(lowerLeftPoint.lon, upperRightPoint.lon);
                var maxLon = Math.max(lowerLeftPoint.lon, upperRightPoint.lon);

                var minLat = Math.min(lowerLeftPoint.lat, upperRightPoint.lat);
                var maxLat = Math.max(lowerLeftPoint.lat, upperRightPoint.lat);

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

            var findField = function(fields, fieldName) {
                return _.find(fields, function(field) {
                    return field.columnName === fieldName;
                }) || {
                    columnName: "",
                    prettyName: ""
                };
            };

            var setDefaultLayerProperties = function(layer) {
                layer.name = (layer.name || layer.table).toUpperCase();
                layer.previousName = layer.name;
                layer.databasePrettyName = getPrettyNameForDatabase(layer.database);
                layer.tablePrettyName = getPrettyNameForTable(layer.table);
                layer.limit = layer.limit || $scope.DEFAULT_LIMIT;
                layer.previousLimit = layer.limit;
                layer.editing = false;
                layer.valid = true;
                layer.visible = true;

                layer.fields = datasetService.getSortedFields(layer.database, layer.table);
                layer.latitudeField = findField(layer.fields, layer.latitudeMapping);
                layer.longitudeField = findField(layer.fields, layer.longitudeMapping);
                layer.sizeField = layer.weightMapping ? findField(layer.fields, layer.weightMapping) : findField(layer.fields, layer.sizeBy);
                layer.colorField = findField(layer.fields, layer.colorBy);
                layer.sourceField = findField(layer.fields, layer.sourceMapping);
                layer.targetField = findField(layer.fields, layer.targetMapping);

                return layer;
            };

            var cloneDatasetLayerConfig = function() {
                var configClone = [];
                var config = datasetService.getMapLayers() || [];
                for(var i = 0; i < config.length; i++) {
                    configClone.push(setDefaultLayerProperties(_.clone(config[i])));
                }
                return configClone;
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

                // Set the map viewing bounds
                $scope.setDefaultView();

                if(initializing) {
                    $scope.updateAndQueryForMapData();
                } else {
                    $scope.$apply(function() {
                        $scope.updateAndQueryForMapData();
                    });
                }
            };

            $scope.updateFields = function() {
                $scope.fields = datasetService.getSortedFields($scope.options.newLayer.database.name, $scope.options.newLayer.table.name);
                $scope.options.newLayer.source = $scope.fields[0];
                $scope.options.newLayer.target = $scope.fields[0];
                $scope.options.newLayer.pointColor = "";
                $scope.options.newLayer.lineColor = "";
                $scope.options.newLayer.colorCode = "";

                var latitude = datasetService.getMapping($scope.options.newLayer.database.name, $scope.options.newLayer.table.name, "latitude") || "";
                $scope.options.newLayer.latitude = _.find($scope.fields, function(field) {
                    return field.columnName === latitude;
                }) || {
                    columnName: "",
                    prettyName: ""
                };
                var longitude = datasetService.getMapping($scope.options.newLayer.database.name, $scope.options.newLayer.table.name, "longitude") || "";
                $scope.options.newLayer.longitude = _.find($scope.fields, function(field) {
                    return field.columnName === longitude;
                }) || {
                    columnName: "",
                    prettyName: ""
                };
                var color = datasetService.getMapping($scope.options.newLayer.database.name, $scope.options.newLayer.table.name, "colorBy") || "";
                $scope.options.newLayer.color = _.find($scope.fields, function(field) {
                    return field.columnName === color;
                }) || {
                    columnName: "",
                    prettyName: ""
                };
                var size = datasetService.getMapping($scope.options.newLayer.database.name, $scope.options.newLayer.table.name, "sizeBy") || "";
                $scope.options.newLayer.size = _.find($scope.fields, function(field) {
                    return field.columnName === size;
                }) || {
                    columnName: "",
                    prettyName: ""
                };
            };

            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.newLayer.database.name);
                $scope.options.newLayer.table = datasetService.getFirstTableWithMappings($scope.options.newLayer.database.name, ["latitude", "longitude"]) || $scope.tables[0];
                $scope.validateLayerName($scope.options.newLayer, -1);
                $scope.updateFields();
            };

            /**
             * Resets the new map layer properties.
             * @method resetNewLayer
             */
            $scope.resetNewLayer = function() {
                $scope.databases = datasetService.getDatabases();
                $scope.options.newLayer.editing = false;
                $scope.options.newLayer.database = $scope.databases[0];
                $scope.options.newLayer.name = "";
                $scope.options.newLayer.type = $scope.DEFAULT_NEW_LAYER_TYPE;
                $scope.options.newLayer.limit = $scope.DEFAULT_LIMIT;
                $scope.updateTables();
            };

            /**
             * Updates the queries to support the current set of configured layers.
             */
            $scope.updateLayersAndQueries = function() {
                var i = 0;
                var layer = {};

                $scope.options.layers = cloneDatasetLayerConfig();
                $scope.limitedLayers = {};

                // Setup the base layer objects.
                for(i = 0; i < $scope.options.layers.length; i++) {
                    layer = $scope.options.layers[i];
                    if(!layer.olLayer) {
                        layer.olLayer = addLayer(layer);
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

            $scope.updateAndQueryForMapData = function() {
                // TODO Add logging for clicks and changes in the options menu while loadingData is false.
                $scope.loadingData = true;

                $timeout(function() {
                    $scope.resetNewLayer();
                    $scope.updateLayersAndQueries();
                    $scope.loadingData = false;
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

                // Check if this Map has a layer with the given database and table.  If no such layer exists, the query is unnecessary so ignore it.
                var hasLayer = $scope.options.layers.some(function(layer) {
                    return layer.database === database && layer.table === table;
                });

                if(!hasLayer) {
                    return;
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

                if($scope.outstandingQuery) {
                    $scope.outstandingQuery.abort();
                }

                $scope.outstandingQuery = connection.executeQuery(query).xhr.done(function(queryResults) {
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
                        $scope.outstandingQuery = undefined;
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
                }).fail(function(response) {
                    $scope.outstandingQuery = undefined;
                    if(response.status === 0) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "canceled",
                            elementId: "map",
                            elementType: "canvas",
                            elementSub: "map",
                            elementGroup: "map_group",
                            source: "system",
                            tags: ["canceled", "map"]
                        });
                    } else {
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
                    }
                });
            };

            /**
             * Redraws the map
             */
            $scope.draw = function() {
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
                var initializing = false;

                // Set data bounds on load
                if(!$scope.dataBounds) {
                    initializing = true;
                    $scope.dataBounds = $scope.computeDataBounds(queryResults.data);
                }

                $scope.dataLength = data.length;
                for(var i = 0; i < $scope.options.layers.length; i++) {
                    if($scope.options.layers[i].database === database && $scope.options.layers[i].table === table && $scope.options.layers[i].olLayer) {
                        // Only use elements up to the limit of this layer; other layers for this database/table may have a higher limit.
                        var limit = $scope.options.layers[i].limit;
                        data = queryResults.data.slice(0, limit);

                        // Only set data and update features if all attributes exist in data
                        if($scope.map.doAttributesExist(data, $scope.options.layers[i].olLayer)) {
                            $scope.options.layers[i].error = undefined;
                            $scope.options.layers[i].olLayer.setData(data);
                            $scope.options.layers[i].olLayer.updateFeatures();
                        } else {
                            $scope.options.layers[i].error = "Error - cannot create layer due to missing fields in data";
                        }

                        // Update the message in the visualization containing the list of limited layers.
                        var index;
                        if(queryResults.data.length >= limit) {
                            if(!$scope.limitedLayers[limit]) {
                                $scope.limitedLayers[limit] = [];
                            }
                            index = $scope.limitedLayers[limit].indexOf($scope.options.layers[i].name);
                            if(index < 0) {
                                $scope.limitedLayers[limit].push($scope.options.layers[i].name);
                            }
                        } else if($scope.limitedLayers[limit]) {
                            index = $scope.limitedLayers[limit].indexOf($scope.options.layers[i].name);
                            if(index >= 0) {
                                $scope.limitedLayers[limit].splice(index, 1);
                            }
                        }
                    }
                }

                $scope.draw();

                if(initializing) {
                    $scope.setDefaultView();
                }
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
                if(data && data.length === 0) {
                    return {
                        left: -180,
                        bottom: -90,
                        right: 180,
                        top: 90
                    };
                } else if(data) {
                    var minLon = 180;
                    var minLat = 90;
                    var maxLon = -180;
                    var maxLat = -90;
                    var latMapping = "latitude";
                    var lonMapping = "longitude";

                    if($scope.options.layers.length && $scope.options.layers[0].type === "node") {
                        var targetMapping = $scope.options.layers[0].targetMapping ? $scope.options.layers[0].targetMapping : "to";
                        var sourceMapping = $scope.options.layers[0].sourceMapping ? $scope.options.layers[0].sourceMapping : "from";
                        latMapping = $scope.options.layers[0].latitudeMapping ? $scope.options.layers[0].latitudeMapping : latMapping;
                        lonMapping = $scope.options.layers[0].longitudeMapping ? $scope.options.layers[0].longitudeMapping : lonMapping;

                        data.forEach(function(d) {
                            var lat = d[targetMapping][latMapping];
                            var lon = d[targetMapping][lonMapping];
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
                            lat = d[sourceMapping][latMapping];
                            lon = d[sourceMapping][lonMapping];
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
                    } else {
                        latMapping = $scope.options.layers[0].latitudeMapping ? $scope.options.layers[0].latitudeMapping : latMapping;
                        lonMapping = $scope.options.layers[0].longitudeMapping ? $scope.options.layers[0].longitudeMapping : lonMapping;

                        data.forEach(function(d) {
                            var lat = d[latMapping];
                            var lon = d[lonMapping];
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
                    }

                    return {
                        left: minLon === 180 ? -180 : minLon,
                        bottom: minLat === 90 ? -90 : minLat,
                        right: maxLon === -180 ? 180 : maxLon,
                        top: maxLat === -90 ? 90 : maxLat
                    };
                }
            };

            $scope.buildPointQuery = function(database, table) {
                var latitudesAndLongitudes = [];
                var limit;
                $scope.options.layers.forEach(function(layer) {
                    if(layer.database === database && layer.table === table) {
                        latitudesAndLongitudes.push({
                            latitude: layer.latitudeMapping,
                            longitude: layer.longitudeMapping
                        });
                        // Use the highest limit for the query from all layers for the given database/table; only the first X elements will be used for each layer based on the limit of the layer.
                        limit = limit ? Math.max(limit, layer.limit) : layer.limit;
                    }
                });

                var query = new neon.query.Query().selectFrom(database, table).limit(limit || $scope.DEFAULT_LIMIT);
                if(datasetService.getActiveDatasetOptions().checkForNullCoordinates) {
                    var filterClauses = latitudesAndLongitudes.map(function(element) {
                        return neon.query.and(neon.query.where(element.latitude, "!=", null), neon.query.where(element.longitude, "!=", null));
                    });
                    return query.where(neon.query.or.apply(neon.query, filterClauses));
                }
                return query;
            };

            $scope.hideClearFilterButton = function() {
                // hide the Clear Filter button.
                $scope.showFilter = false;
                $scope.error = "";
            };

            /**
             * Creates and returns a filter on the given latitude/longitude fields using the extent set by this visualization.
             * @param {Object} databaseAndTableName Contains the database and table name
             * @param {Array} fieldNames An array containing the names of the latitude and longitude fields (as its first and second elements) on which to filter
             * @method createFilterClauseForExtent
             * @return {Object} A neon.query.Filter object
             */
            $scope.createFilterClauseForExtent = function(databaseAndTableName, fieldNames) {
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
                    } else if(callback) {
                        callback();
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

                // Save the filter keys for each affected layer so all their filters can be removed if necessary.
                var layerFilterKeysList = [];

                $scope.options.layers.forEach(function(element) {
                    // Ensure all map layers with the same database/table/latitude/longitude as the given layer have the same active status.
                    if(element.database === layer.database && element.table === layer.table && element.latitudeMapping === layer.latitudeMapping && element.longitudeMapping === layer.longitudeMapping) {
                        element.active = layer.active;
                        layerFilterKeysList.push(element.filterKeys);
                    }
                });

                if($scope.zoomRectId) {
                    if(layer.active) {
                        addFilters();
                    } else {
                        clearFiltersRecursively(layerFilterKeysList, function() {
                            $scope.queryForMapData(layer.database, layer.table);
                        });
                    }
                }
            };

            $scope.updateLayerVisibility = function(layer) {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "click",
                    elementId: "map-layer-active-button",
                    elementType: "button",
                    elementGroup: "map_group",
                    source: "user",
                    tags: ["options", "map", "layer", layer.name, "active", layer.active]
                });

                $scope.map.setLayerVisibility(layer.olLayer.id, layer.visible);
            };

            /**
             * Creates or removes points on map layer (named "Selected Point") for the given data
             * @param {Object} msg
             * @param {Object} msg.data
             * @param {String} msg.database
             * @param {String} msg.table
             * @method createPoint
             */
            $scope.createPoint = function(msg) {
                if(msg.data) {
                    // Remove previously selected point, if exists
                    if($scope.selectedPointLayer.name) {
                        $scope.map.removeLayer($scope.selectedPointLayer);
                    }

                    var mappings = datasetService.getMappings(msg.database, msg.table);

                    var latMapping = "latitude";
                    var lonMapping = "longitude";
                    var layer = new coreMap.Map.Layer.SelectedPointsLayer("Selected Points");

                    /*
                     * Create points on the map using either:
                     *      - lat/lon pairs specified in the allCoordinates mapping in the config
                     *      - the lat/lon mapping specified in the points layer for the specified
                     *        database and table
                     */
                    var point;
                    var feature;
                    if(mappings.allCoordinates && mappings.allCoordinates.length) {
                        var features = [];

                        for(var i = 0; i < mappings.allCoordinates.length; i++) {
                            latMapping = mappings.allCoordinates[i].latitude;
                            lonMapping = mappings.allCoordinates[i].longitude;

                            point = new OpenLayers.Geometry.Point(msg.data[lonMapping], msg.data[latMapping]);
                            point.transform(coreMap.Map.SOURCE_PROJECTION, coreMap.Map.DESTINATION_PROJECTION);

                            feature = new OpenLayers.Feature.Vector(point);
                            feature.attributes = msg.data;

                            features.push(feature);
                        }

                        layer.addFeatures(features);
                    } else {
                        var pointsLayer = _.find(datasetService.getMapLayers(), {
                            type: "points",
                            database: msg.database,
                            table: msg.table
                        });

                        if(pointsLayer) {
                            latMapping = pointsLayer.latitudeMapping;
                            lonMapping = pointsLayer.longitudeMapping;
                        }

                        point = new OpenLayers.Geometry.Point(msg.data[lonMapping], msg.data[latMapping]);
                        point.transform(coreMap.Map.SOURCE_PROJECTION, coreMap.Map.DESTINATION_PROJECTION);

                        feature = new OpenLayers.Feature.Vector(point);
                        feature.attributes = msg.data;

                        layer.addFeatures(feature);
                    }

                    $scope.map.addLayer(layer);
                    $scope.selectedPointLayer = layer;
                } else if($scope.selectedPointLayer.name) {
                    $scope.map.removeLayer($scope.selectedPointLayer);
                    $scope.selectedPointLayer = {};
                }
            };

            /**
             * Sets the maps viewing bounds to either those defined in the configuration file, the data bounds, or
             * all the way zoomed out
             * @method setDefaultView
             */
            $scope.setDefaultView = function() {
                var mapConfig = datasetService.getMapConfig();
                if(mapConfig && mapConfig.bounds) {
                    $scope.map.zoomToBounds(mapConfig.bounds);
                } else if($scope.dataBounds) {
                    $scope.zoomToDataBounds();
                } else {
                    $scope.map.zoomToBounds({
                        left: -180,
                        bottom: -90,
                        right: 180,
                        top: 90
                    });
                }
            };

            /**
             * Updates the field mappings in the given layer and returns the layer.
             * @param {Object} layer
             * @method updateLayerFieldMappings
             * @return {Object}
             * @private
             */
            var updateLayerFieldMappings = function(layer) {
                layer.latitudeMapping = layer.latitudeField.columnName;
                layer.longitudeMapping = layer.longitudeField.columnName;
                layer.sizeBy = layer.sizeField ? layer.sizeField.columnName : "";
                layer.colorBy = layer.colorField ? layer.colorField.columnName : "";
                layer.weightMapping = layer.sizeField ? layer.sizeField.columnName : "";
                layer.sourceMapping = layer.sourceField.columnName;
                layer.targetMapping = layer.targetField.columnName;
                return layer;
            };

            /**
             * Updates the given layer by recreating it in the map.
             * @param {Object} layer
             * @method updateLayer
             */
            $scope.updateLayer = function(layer) {
                layer.name = (layer.name || layer.table).toUpperCase();
                layer = updateLayerFieldMappings(layer);

                var index;
                if(layer.previousLimit !== layer.limit) {
                    // Remove the old limit/name.
                    index = $scope.limitedLayers[layer.previousLimit].indexOf(layer.previousName);
                    if(index >= 0) {
                        $scope.limitedLayers[layer.previousLimit].splice(index, 1);
                    }
                    // Add the new limit/name.
                    if(!$scope.limitedLayers[layer.limit]) {
                        $scope.limitedLayers[layer.limit] = [];
                    }
                    $scope.limitedLayers[layer.limit].push(layer.name);
                } else if(layer.previousName !== layer.name) {
                    // Replace the old name with the new name.
                    index = $scope.limitedLayers[layer.limit].indexOf(layer.previousName);
                    if(index >= 0) {
                        $scope.limitedLayers[layer.limit].splice(index, 1, layer.name);
                    }
                }

                if(layer.olLayer) {
                    this.map.removeLayer(layer.olLayer);
                    layer.olLayer = undefined;
                }

                layer.previousName = layer.name;
                layer.previousLimit = layer.limit;
                layer.editing = false;
                layer.olLayer = addLayer(layer);
                $scope.map.setLayerVisibility(layer.olLayer.id, layer.visible);
                $scope.queryForMapData(layer.database, layer.table);
            };

            /**
             * Creates and adds a layer to the map
             * @param {Object} layer
             * @method addLayer
             * @private
             */
            var addLayer = function(layer) {
                var mappings = datasetService.getMappings(layer.database, layer.table);

                if(layer.type === coreMap.Map.POINTS_LAYER) {
                    layer.olLayer = new coreMap.Map.Layer.PointsLayer(layer.name, {
                        latitudeMapping: layer.latitudeMapping,
                        longitudeMapping: layer.longitudeMapping,
                        sizeMapping: layer.sizeBy,
                        categoryMapping: layer.colorBy,
                        dateMapping: mappings.date,
                        gradient: layer.gradient,
                        defaultColor: layer.defaultColor,
                        linkyConfig: ($scope.linkyConfig.linkTo ? $scope.linkyConfig :
                            {
                                mentions: false,
                                hashtags: false,
                                urls: true,
                                linkTo: ""
                            })
                    });
                    $scope.map.addLayer(layer.olLayer);
                } else if(layer.type === coreMap.Map.CLUSTER_LAYER) {
                    layer.olLayer = new coreMap.Map.Layer.PointsLayer(layer.name, {
                        latitudeMapping: layer.latitudeMapping,
                        longitudeMapping: layer.longitudeMapping,
                        sizeMapping: layer.sizeBy,
                        categoryMapping: layer.colorBy,
                        dateMapping: mappings.date,
                        defaultColor: layer.defaultColor,
                        cluster: true,
                        linkyConfig: ($scope.linkyConfig.linkTo ? $scope.linkyConfig :
                            {
                                mentions: false,
                                hashtags: false,
                                urls: true,
                                linkTo: ""
                            }),
                        clusterPopupFields: layer.popupFields
                    });
                    $scope.map.addLayer(layer.olLayer);
                } else if(layer.type === coreMap.Map.HEATMAP_LAYER) {
                    layer.olLayer = new coreMap.Map.Layer.HeatmapLayer(layer.name,
                        $scope.map.map,
                        $scope.map.map.baseLayer, {
                        latitudeMapping: layer.latitudeMapping,
                        longitudeMapping: layer.longitudeMapping,
                        sizeMapping: layer.sizeBy
                    });
                    $scope.map.addLayer(layer.olLayer);
                } else if(layer.type === coreMap.Map.NODE_LAYER) {
                    layer.olLayer = new coreMap.Map.Layer.NodeLayer(layer.name, {
                        sourceMapping: layer.sourceMapping,
                        targetMapping: layer.targetMapping,
                        weightMapping: layer.weightMapping,
                        latitudeMapping: layer.latitudeMapping,
                        longitudeMapping: layer.longitudeMapping,
                        idMapping: layer.nodeIdMapping,
                        dateMapping: mappings.date,
                        nodeColor: layer.nodeColor,
                        lineColor: layer.edgeColor
                    });
                    $scope.map.addLayer(layer.olLayer);
                }

                return layer.olLayer;
            };

            /**
             * Toggles editing on the given layer.
             * @param {Object} layer
             * @method toggleEditing
             */
            $scope.toggleEditing = function(layer) {
                layer.editing = !layer.editing;
            };

            /**
             * Deletes the given layer from this map.
             * @param {Object} layer
             * @method deleteLayer
             */
            $scope.deleteLayer = function(layer) {
                // Remove layer from the limit text.
                var index = $scope.limitedLayers[layer.limit] ? $scope.limitedLayers[layer.limit].indexOf(layer.name) : -1;
                if(index >= 0) {
                    $scope.limitedLayers[layer.limit].splice(index, 1);
                }

                // Remove layer from the map.
                $scope.map.removeLayer(layer.olLayer);
                layer.olLayer = undefined;

                // Remove layer from the global list of layers.
                index = _.findIndex($scope.options.layers, function(element) {
                    return element.name === layer.name;
                });
                $scope.options.layers.splice(index, 1);
            };

            /**
             * Adds a new map layer using the properties set in the options menu, queries for new map data, draws the new map layer, and resets the new map layer properties for reuse.
             * @method addNewLayer
             */
            $scope.addNewLayer = function() {
                var layer = {
                    name: ($scope.options.newLayer.name || $scope.options.newLayer.table.name).toUpperCase(),
                    type: $scope.options.newLayer.type,
                    database: $scope.options.newLayer.database.name,
                    databasePrettyName: getPrettyNameForDatabase($scope.options.newLayer.database.name),
                    table: $scope.options.newLayer.table.name,
                    tablePrettyName: getPrettyNameForTable($scope.options.newLayer.table.name),
                    fields: $scope.fields,
                    limit: $scope.options.newLayer.limit,
                    latitudeField: $scope.options.newLayer.latitude,
                    latitudeMapping: $scope.options.newLayer.latitude.columnName,
                    longitudeField: $scope.options.newLayer.longitude,
                    longitudeMapping: $scope.options.newLayer.longitude.columnName,
                    sizeField: $scope.options.newLayer.size,
                    sizeBy: $scope.options.newLayer.sizeField ? $scope.options.newLayer.size.columnName : "",
                    colorField: $scope.options.newLayer.color,
                    colorBy: $scope.options.newLayer.color ? $scope.options.newLayer.color.columnName : "",
                    defaultColor: $scope.options.newLayer.colorCode,
                    weightMapping: $scope.options.newLayer.sizeField ? $scope.options.newLayer.size.columnName : "",
                    sourceField: $scope.options.newLayer.source,
                    sourceMapping: $scope.options.newLayer.source.columnName,
                    targetField: $scope.options.newLayer.target,
                    targetMapping: $scope.options.newLayer.target.columnName,
                    nodeColor: $scope.options.newLayer.pointColor,
                    lineColor: $scope.options.newLayer.lineColor,
                    active: $scope.options.newLayer.active,
                    visible: $scope.options.newLayer.visible,
                    valid: true,
                    editing: false
                };

                layer.previousName = layer.name;
                layer.previousLimit = layer.limit;
                layer.olLayer = addLayer(layer);
                layer.filterKeys = filterService.createFilterKeys("map", datasetService.getDatabaseAndTableNames());
                $scope.options.layers.push(layer);
                $scope.queryForMapData(layer.database, layer.table);
                $scope.resetNewLayer();
            };

            /**
             * Moves the given layer to the given new index and reorders the other layers as needed.
             * @param {Number} newIndexReversed
             * @param {Object} layer
             * @method reorderLayer
             */
            $scope.reorderLayer = function(newIndexReversed, layer) {
                var newIndex = $scope.options.layers.length - 1 - newIndexReversed;
                var oldIndex = $scope.options.layers.indexOf(layer);
                $scope.options.layers.splice(oldIndex, 1);
                $scope.options.layers.splice(newIndex, 0, layer);
                $scope.map.reorderLayers($scope.options.layers.map(function(element) {
                    return element.olLayer;
                }));
            };

            /**
             * Sets the {Boolean} valid property of the given layer object at the given index based on whether its name matches the name of any other existing layers.
             * @param {Object} layer
             * @param {Number} layerIndexReversed
             * @method validateLayerName
             */
            $scope.validateLayerName = function(layer, layerIndexReversed) {
                var layerIndex = $scope.options.layers.length - 1 - layerIndexReversed;
                layer.valid = !($scope.options.layers.some(function(element, elementIndex) {
                    return element.name === (layer.name || layer.table.name).toUpperCase() && elementIndex !== layerIndex;
                }));
            };

            /**
             * Sets the {Boolean} valid property of the global new layer object based on whether its name matches the name of any other existing layers.
             * @method validateNewLayerName
             */
            $scope.validateNewLayerName = function() {
                $scope.options.newLayer.valid = !($scope.options.layers.some(function(element) {
                    return element.name === ($scope.options.newLayer.name || $scope.options.newLayer.table.name).toUpperCase();
                }));
            };

            /**
             * Toggles the editing status of the new layer object and validates its name.
             * @method clickAddNewLayerButton
             */
            $scope.clickAddNewLayerButton = function() {
                $scope.toggleEditing($scope.options.newLayer);
                $scope.validateNewLayerName();
            };

            var getPrettyNameForDatabase = function(databaseName) {
                var name = databaseName;
                $scope.databases.forEach(function(database) {
                    if(database.name === databaseName) {
                        name = database.prettyName;
                    }
                });
                return name;
            };

            var getPrettyNameForTable = function(tableName) {
                var name = tableName;
                $scope.tables.forEach(function(table) {
                    if(table.name === tableName) {
                        tableName = table.prettyName;
                    }
                });
                return name;
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeMapExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "map-export",
                    elementType: "button",
                    elementGroup: "map_group",
                    source: "user",
                    tags: ["options", "map", "export"]
                });
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
                        query.limitClause = exportService.getLimitClause();
                        var tempObject = {
                            query: query,
                            name: "map_" + keys[i] + "_" + tables[j] + "-" + $scope.exportID,
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

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
