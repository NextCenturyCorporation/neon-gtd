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
.directive('map', ['external', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService',
    'LinksPopupService', 'ThemeService', 'VisualizationService', '$timeout', '$filter',
    function(external, connectionService, datasetService, errorNotificationService, filterService, exportService,
    linksPopupService, themeService, visualizationService, $timeout, $filter) {
    return {
        templateUrl: 'partials/directives/map.html',
        restrict: 'EA',
        scope: {
            bindConfig: '=?',
            bindStateId: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            $element.addClass('map-container');

            $scope.element = $element;

            $scope.optionsMenuButtonText = function() {
                var text = "";
                $scope.options.layers.forEach(function(layer, index) {
                    text += (text ? ", " : "") + layer.name;
                    if(layer.dataLength && layer.dataLength >= layer.limit) {
                        text += " (" + $filter('number')(layer.limit) + " limit)";
                    }
                });
                return text;
            };

            $scope.showOptionsMenuButtonText = function() {
                return true;
            };

            // Function on resize given to the options menu directive.
            $scope.resizeOptionsMenu = function() {
                var container = $element.find(".menu-container");
                // Make the height of the options menu match the height of the visualization below the header menu container.
                var height = $element.height() - container.outerHeight(true);
                // Make the width of the options menu match the width of the visualization.
                var width = $element.outerWidth(true);

                var popover = container.find(".popover-content");
                popover.css("height", height + "px");
                popover.css("width", width + "px");
            };


            // Setup scope variables.
            $scope.cacheMap = false;
            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.dataBounds = undefined;
            $scope.resizeRedrawDelay = 1500; // Time in ms to wait after a resize event flood to try redrawing the map.
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.selectedPointLayer = {};
            $scope.outstandingQuery = {};
            $scope.linksPopupButtonIsDisabled = true;
            $scope.helpers = neon.helpers;
            $scope.legend = {
                display: false,
                layers: []
            };

            $scope.MAP_LAYER_TYPES = [coreMap.Map.POINTS_LAYER, coreMap.Map.CLUSTER_LAYER, coreMap.Map.HEATMAP_LAYER, coreMap.Map.NODE_LAYER];
            $scope.DEFAULT_LIMIT = 1000;
            $scope.DEFAULT_NEW_LAYER_TYPE = $scope.MAP_LAYER_TYPES[0];
            $scope.SELECTION_EVENT_CHANNEL = "QUERY_RESULTS_SELECTION_EVENT";

            $scope.options = {
                baseLayerColor: "light",
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
                    nodeColorBy: "",
                    lineColorBy: "",
                    nodeDefaultColor: "",
                    lineDefaultColor: "",
                    limit: $scope.DEFAULT_LIMIT,
                    type: $scope.DEFAULT_NEW_LAYER_TYPE
                }
            };

            // Setup our map.
            $scope.mapId = uuid();
            $element.append('<div id="' + $scope.mapId + '" class="map"></div>');

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
                    if(!$scope.outstandingQuery[keys[i]]) {
                        $scope.outstandingQuery[keys[i]] = {};
                    }
                    for(var j = 0; j < tables.length; j++) {
                        if(!$scope.outstandingQuery[keys[i]][tables[j]]) {
                            $scope.outstandingQuery[keys[i]][tables[j]] = undefined;
                        }
                        queryForMapData(keys[i], tables[j]);
                    }
                }
            };

            var queryForMapPopupData = function(database, table, id, callback) {
                var connection = connectionService.getActiveConnection();

                if(!connection) {
                    callback({});
                    return;
                }

                var query = new neon.query.Query().selectFrom(database, table);

                if(_.isArray(id)) {
                    var whereClauses = id.map(function(value) {
                        return neon.query.where("_id", "=", value);
                    });
                    query.where(neon.query.or.apply(neon.query, whereClauses));
                } else {
                    query.where("_id", "=", id);
                }

                connection.executeQuery(query, function(results) {
                    callback(results.data);
                }, function(response) {
                    callback({});
                });
            };

            /**
             * Initializes the name of the directive's scope variables
             * and the Neon Messenger used to monitor data change events.
             * @method initialize
             * @private
             */
            var initialize = function() {
                var datasetOptions = datasetService.getActiveDatasetOptions();
                $scope.options.baseLayerColor = (datasetOptions && datasetOptions.mapBaseLayer ? datasetOptions.mapBaseLayer.color : undefined) || "light";
                $scope.map = new coreMap.Map($scope.mapId, {
                    responsive: false,
                    mapBaseLayer: (datasetOptions ? datasetOptions.mapBaseLayer : undefined) || {},
                    getNestedValue: $scope.helpers.getNestedValue,
                    queryForMapPopupDataFunction: queryForMapPopupData
                });
                $scope.map.linksPopupService = linksPopupService;

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
                $scope.messenger.subscribe($scope.SELECTION_EVENT_CHANNEL, createPoint);

                $scope.exportID = exportService.register($scope.makeMapExportObject);

                visualizationService.register($scope.bindStateId, bindFields);

                $scope.linkyConfig = datasetService.getLinkyConfig();

                $scope.messenger.subscribe('date_selected', onDateSelected);

                themeService.registerListener($scope.mapId, onThemeChanged);

                $element.find('.legend-container .legend').on({
                    "shown.bs.dropdown": function() {
                        this.closable = false;
                    },
                    click: function() {
                        this.closable = true;
                    },
                    "hide.bs.dropdown": function() {
                        return this.closable;
                    }
                });

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

                    linksPopupService.deleteLinks($scope.mapId);
                    $scope.options.layers.forEach(function(layer) {
                        linksPopupService.deleteLinks(generatePointLinksSource(layer.database, layer.table));
                    });

                    $element.off("resize", updateSize);
                    $scope.messenger.unsubscribeAll();
                    if($scope.extent) {
                        $scope.clearFilters();
                    }
                    exportService.unregister($scope.exportID);
                    visualizationService.unregister($scope.bindStateId);
                    themeService.unregisterListener($scope.mapId);
                });

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

                // Setup a basic resize handler to redraw the map and calculate its size if our div changes.
                // Since the map redraw can take a while and resize events can come in a flood, we attempt to
                // redraw only after a second of no consecutive resize events.
                var redrawOnResize = function() {
                    $scope.map.resizeToElement();
                    $scope.resizePromise = null;
                };

                var resizeLegend = function() {
                    var container = $element.find(".legend-container");
                    var containerCss = container.outerHeight(true) - container.height();

                    var legend = container.find(".legend");
                    var legendCss = legend.outerHeight(true) - legend.height();

                    var divider = container.find(".legend>.divider");
                    var dividerCss = divider.outerHeight(true);
                    var header = container.find(".legend>.header-text");
                    var headerCss = header.outerHeight(true);
                    var height = $element.height() - containerCss - legendCss - dividerCss - headerCss - 10;

                    var legendDetails = container.find(".legend-details");
                    legendDetails.css("max-height", height + "px");
                };

                var updateSize = function() {
                    if($scope.resizePromise) {
                        $timeout.cancel($scope.resizePromise);
                    }
                    $scope.resizePromise = $timeout(redrawOnResize, $scope.resizeRedrawDelay);
                    resizeLegend();
                };

                $element.resize(updateSize);

                // Add a zoomRect handler to the map.
                $scope.map.onZoomRect = function(bounds) {
                    $scope.extent = boundsToExtent(bounds);
                    if(external.services.bounds) {
                        var boundsLinks = [];
                        Object.keys(external.services.bounds.apps).forEach(function(app) {
                            var linkData = {};
                            linkData[neonMappings.BOUNDS] = {};
                            linkData[neonMappings.BOUNDS][neonMappings.MIN_LAT] = $scope.extent.minimumLatitude;
                            linkData[neonMappings.BOUNDS][neonMappings.MIN_LON] = $scope.extent.minimumLongitude;
                            linkData[neonMappings.BOUNDS][neonMappings.MAX_LAT] = $scope.extent.maximumLatitude;
                            linkData[neonMappings.BOUNDS][neonMappings.MAX_LON] = $scope.extent.maximumLongitude;
                            boundsLinks.push(linksPopupService.createServiceLinkObjectWithData(external.services.bounds, app, linkData));
                        });
                        linksPopupService.addLinks($scope.mapId, $scope.getBoundsKeyForLinksPopupButton(), boundsLinks);
                        $scope.linksPopupButtonIsDisabled = !boundsLinks.length;
                    }

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

            $scope.getBoundsKeyForLinksPopupButton = function() {
                return $scope.extent ? linksPopupService.generateBoundsKey($scope.extent.minimumLatitude, $scope.extent.minimumLongitude, $scope.extent.maximumLatitude, $scope.extent.maximumLongitude) : "";
            };

            /**
             * Adds the current map filter to all active map layers, or any layers given, queries for
             * map data, and redraws the layers on the map.
             * @param {Array} [layersToUpdate] Optional list of layers to add
             * @method addFilters
             * @private
             */
            var addFilters = function(layersToUpdate) {
                var activeLayers = layersToUpdate ? layersToUpdate : _.filter($scope.options.layers, {
                    active: true
                });

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
                } else {
                    drawZoomRect({
                        left: $scope.extent.minimumLongitude,
                        bottom: $scope.extent.minimumLatitude,
                        right: $scope.extent.maximumLongitude,
                        top: $scope.extent.maximumLatitude
                    });
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
                }
            };

            /**
             * This method will apply filters to all actively filtering layers and trigger a single
             * callback after all filters have been applied.
             * @params {Array} activeLayers
             * @params {Function} successCallback
             * @method filterActiveLayersRecursively
             * @private
             */
            var filterActiveLayersRecursively = function(activeLayers, successCallback) {
                var layer = activeLayers.shift();
                filterService.addFilter($scope.messenger, layer.database, layer.table, getLatLonMappings(layer), createFilterClauseForExtent, {
                    visName: "Map"
                }, function() {
                    if(activeLayers.length) {
                        filterActiveLayersRecursively(activeLayers, successCallback);
                    } else {
                        if(successCallback) {
                            successCallback();
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

                    if(message.type === "REMOVE" && $scope.extent && _.keys($scope.extent).length) {
                        var layersToRemove = [];
                        _.each($scope.options.layers, function(layer) {
                            if(layer.database === message.removedFilter.databaseName && layer.table === message.removedFilter.tableName) {
                                var filter;
                                if(layer.type === coreMap.Map.NODE_LAYER) {
                                    var sourceLat = layer.sourceMapping + "." + layer.latitudeMapping;
                                    var sourceLon = layer.sourceMapping + "." + layer.longitudeMapping;
                                    var targetLat = layer.targetMapping + "." + layer.latitudeMapping;
                                    var targetLon = layer.targetMapping + "." + layer.longitudeMapping;
                                    filter = createFilterClauseForExtent(null, [sourceLat, sourceLon, targetLat, targetLon]);
                                } else {
                                    filter = createFilterClauseForExtent(null, [layer.latitudeMapping, layer.longitudeMapping]);
                                }

                                if(filterService.areClausesEqual(message.removedFilter.whereClause, filter)) {
                                    layersToRemove.push(layer);
                                    layer.active = false;
                                }
                            }
                        });

                        if(layersToRemove.length) {
                            clearFiltersRecursively(layersToRemove, function() {
                                queryForMapData(message.removedFilter.databaseName, message.removedFilter.tableName);
                            });
                            return;
                        }
                    }

                    queryForMapData(message.addedFilter.databaseName, message.addedFilter.tableName);
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

            var setDefaultLayerProperties = function(layer) {
                layer.name = (layer.name || layer.table).toUpperCase();
                layer.databasePrettyName = datasetService.getPrettyNameForDatabase(layer.database);
                layer.tablePrettyName = datasetService.getPrettyNameForTable(layer.database, layer.table);
                layer.limit = layer.limit || $scope.DEFAULT_LIMIT;
                layer.editing = false;
                layer.valid = true;
                layer.visible = true;

                layer.fields = datasetService.getSortedFields(layer.database, layer.table);
                layer.latitudeField = datasetService.findField(layer.fields, layer.latitudeMapping);
                layer.longitudeField = datasetService.findField(layer.fields, layer.longitudeMapping);
                layer.sizeField = layer.weightMapping ? datasetService.findField(layer.fields, layer.weightMapping) : datasetService.findField(layer.fields, layer.sizeBy);
                layer.colorField = datasetService.findField(layer.fields, layer.colorBy);
                layer.sourceField = datasetService.findField(layer.fields, layer.sourceMapping);
                layer.targetField = datasetService.findField(layer.fields, layer.targetMapping);
                layer.nodeColorField = datasetService.findField(layer.fields, layer.nodeColorBy);
                layer.lineColorField = datasetService.findField(layer.fields, layer.lineColorBy);

                return layer;
            };

            var cloneDatasetLayersConfig = function() {
                var mapLayers = [];
                datasetService.getMapLayers($scope.bindConfig).forEach(function(mapLayer) {
                    mapLayers.push(setDefaultLayerProperties(_.clone(mapLayer)));
                });
                return mapLayers;
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
             * @method displayActiveDataset
             * @private
             */
            var displayActiveDataset = function() {
                if(!datasetService.hasDataset() || $scope.loadingData) {
                    return;
                }

                // Clear the zoom Rect from the map before reinitializing it.
                clearZoomRect();
                clearExtent();

                $scope.dataBounds = undefined;

                // Call removeLayer on all existing layers.
                $scope.clearLayers();

                // Set the map viewing bounds
                $scope.setDefaultView();
                $scope.updateAndQueryForMapData();
            };

            $scope.updateFields = function() {
                $scope.fields = datasetService.getSortedFields($scope.options.newLayer.database.name, $scope.options.newLayer.table.name);
                $scope.options.newLayer.source = $scope.fields[0];
                $scope.options.newLayer.target = $scope.fields[0];
                $scope.options.newLayer.nodeDefaultColor = "";
                $scope.options.newLayer.lineDefaultColor = "";
                $scope.options.newLayer.colorCode = "";
                $scope.options.newLayer.gradient1 = "";
                $scope.options.newLayer.gradient2 = "";
                $scope.options.newLayer.gradient3 = "";
                $scope.options.newLayer.gradient4 = "";
                $scope.options.newLayer.gradient5 = "";

                var latitude = datasetService.getMapping($scope.options.newLayer.database.name, $scope.options.newLayer.table.name, neonMappings.LATITUDE) || "";
                $scope.options.newLayer.latitude = _.find($scope.fields, function(field) {
                    return field.columnName === latitude;
                }) || datasetService.createBlankField();
                var longitude = datasetService.getMapping($scope.options.newLayer.database.name, $scope.options.newLayer.table.name, neonMappings.LONGITUDE) || "";
                $scope.options.newLayer.longitude = _.find($scope.fields, function(field) {
                    return field.columnName === longitude;
                }) || datasetService.createBlankField();
                var color = datasetService.getMapping($scope.options.newLayer.database.name, $scope.options.newLayer.table.name, neonMappings.COLOR) || "";
                $scope.options.newLayer.color = _.find($scope.fields, function(field) {
                    return field.columnName === color;
                }) || datasetService.createBlankField();
                var size = datasetService.getMapping($scope.options.newLayer.database.name, $scope.options.newLayer.table.name, neonMappings.SIZE) || "";
                $scope.options.newLayer.size = _.find($scope.fields, function(field) {
                    return field.columnName === size;
                }) || datasetService.createBlankField();
                var nodeColorBy = datasetService.getMapping($scope.options.newLayer.database.name, $scope.options.newLayer.table.name, "nodeColorBy") || "";
                $scope.options.newLayer.nodeColorBy = _.find($scope.fields, function(field) {
                    return field.columnName === nodeColorBy;
                }) || datasetService.createBlankField();
                var lineColorBy = datasetService.getMapping($scope.options.newLayer.database.name, $scope.options.newLayer.table.name, "lineColorBy") || "";
                $scope.options.newLayer.lineColorBy = _.find($scope.fields, function(field) {
                    return field.columnName === lineColorBy;
                }) || datasetService.createBlankField();
            };

            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.newLayer.database.name);
                $scope.options.newLayer.table = datasetService.getFirstTableWithMappings($scope.options.newLayer.database.name, [neonMappings.LATITUDE, neonMappings.LONGITUDE]) || $scope.tables[0];
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
            var updateLayersAndQueries = function() {
                var i = 0;
                var layer = {};
                var rect = {};

                $scope.options.layers = cloneDatasetLayersConfig();

                // Setup the base layer objects.
                for(i = 0; i < $scope.options.layers.length; i++) {
                    layer = $scope.options.layers[i];
                    if(!layer.olLayer) {
                        layer.olLayer = addLayer(layer);
                    }

                    var filter = filterService.getFilter($scope.options.layers[i].database, $scope.options.layers[i].table,
                        getLatLonMappings($scope.options.layers[i]));

                    if(filter && $scope.options.layers[i].active && !_.keys(rect).length) {
                        rect = getZoomRectForFilter($scope.options.layers[i], filter);
                    }
                }

                if(_.keys(rect).length) {
                    $scope.extent = rect;

                    if(external.services.bounds) {
                        var boundsLinks = [];
                        Object.keys(external.services.bounds.apps).forEach(function(app) {
                            var linkData = {};
                            linkData[neonMappings.BOUNDS] = {};
                            linkData[neonMappings.BOUNDS][neonMappings.MIN_LAT] = $scope.extent.minimumLatitude;
                            linkData[neonMappings.BOUNDS][neonMappings.MIN_LON] = $scope.extent.minimumLongitude;
                            linkData[neonMappings.BOUNDS][neonMappings.MAX_LAT] = $scope.extent.maximumLatitude;
                            linkData[neonMappings.BOUNDS][neonMappings.MAX_LON] = $scope.extent.maximumLongitude;
                            boundsLinks.push(linksPopupService.createServiceLinkObjectWithData(external.services.bounds, app, linkData));
                        });
                        linksPopupService.addLinks($scope.mapId, $scope.getBoundsKeyForLinksPopupButton(), boundsLinks);
                        $scope.linksPopupButtonIsDisabled = !boundsLinks.length;
                    }

                    drawZoomRect(rect);
                }

                queryAllLayerTables();
            };

            /**
             * Calculates the zoom rectangle based on the given filter.
             * @param {Object} layer
             * @param {Object} filter
             * @method getZoomRectForFilter
             * @private
             */
            var getZoomRectForFilter = function(layer, filter) {
                var minLat;
                var minLon;
                var maxLat;
                var maxLon;

                var latLonMappings = getLatLonMappings(layer);
                var latMapping = latLonMappings[0];
                var clauses;

                if(latLonMappings.length > 2) {
                    clauses = filter.filter.whereClause.whereClauses[0].whereClauses;
                } else {
                    clauses = filter.filter.whereClause.whereClauses;
                }

                _.each(clauses, function(clause) {
                    if(clause.type === "or") {
                        minLon = clause.whereClauses[0].whereClauses[0].rhs;
                        maxLon = clause.whereClauses[0].whereClauses[1].rhs;
                    } else if(clause.lhs === latMapping) {
                        if(clause.operator === ">=") {
                            minLat = clause.rhs;
                        } else {
                            maxLat = clause.rhs;
                        }
                    } else {
                        if(clause.operator === ">=") {
                            minLon = clause.rhs;
                        } else {
                            maxLon = clause.rhs;
                        }
                    }
                });
                if(!minLon && !maxLon) {
                    minLon = -180;
                    maxLon = 180;
                }
                return {
                    left: minLon,
                    bottom: minLat,
                    right: maxLon,
                    top: maxLat
                };
            };

            /*
             * Retrives the latitude and longitude mappings based on the given layer.
             * @param {Object} layer
             * @method getLatLonMappings
             * @private
             */
            var getLatLonMappings = function(layer) {
                var latLons = [];
                if(layer.type === coreMap.Map.NODE_LAYER) {
                    latLons.push(layer.sourceMapping + "." + layer.latitudeMapping);
                    latLons.push(layer.sourceMapping + "." + layer.longitudeMapping);
                    latLons.push(layer.targetMapping + "." + layer.latitudeMapping);
                    latLons.push(layer.targetMapping + "." + layer.longitudeMapping);
                } else {
                    latLons.push(layer.latitudeMapping);
                    latLons.push(layer.longitudeMapping);
                }
                return latLons;
            };

            $scope.updateAndQueryForMapData = function() {
                // TODO Add logging for clicks and changes in the options menu while loadingData is false.
                $scope.loadingData = true;

                $timeout(function() {
                    $scope.resetNewLayer();
                    updateLayersAndQueries();
                    $scope.loadingData = false;
                });
            };

            /**
             * @method queryForMapData
             */
            var queryForMapData = function(database, table) {
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

                linksPopupService.deleteLinks(generatePointLinksSource(database, table));

                if(!connection) {
                    updateMapData(database, table, {
                        data: []
                    });
                    return;
                }

                var query = buildPointQuery(database, table);

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

                if($scope.outstandingQuery[database] && $scope.outstandingQuery[database][table]) {
                    $scope.outstandingQuery[database][table].abort();
                }

                $scope.outstandingQuery[database][table] = connection.executeQuery(query);
                $scope.outstandingQuery[database][table].always(function() {
                    $scope.outstandingQuery[database][table] = undefined;
                });
                $scope.outstandingQuery[database][table].done(function(queryResults) {
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
                        updateMapData(database, table, queryResults);

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
                });
                $scope.outstandingQuery[database][table].fail(function(response) {
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
                        updateMapData(database, table, {
                            data: []
                        });
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
                    }
                });
            };

            /**
             * Returns the source to use in the links popup for the map layer using the database and table with the given names.
             * @param {String} database
             * @param {String} table
             * @method generatePointLinksSource
             * @private
             * @return {String}
             */
            var generatePointLinksSource = function(database, table) {
                return $scope.mapId + "-" + database + "-" + table;
            };

            /**
             * Shows/hides the legend
             * @method toggleLegend
             */
            $scope.toggleLegend = function() {
                $scope.legend.display = !$scope.legend.display;
            };

            /**
             * Shows/hides the legend for a single layer
             * @param {Number} index The index in the legend that contains the layer to show/hide
             * @method toggleLegend
             */
            $scope.toggleLegendLayer = function(index) {
                $scope.legend.layers[index].display = !$scope.legend.layers[index].display;
            };

            /**
             * Updates the data bound to the map managed by this directive.  This will trigger a change in
             * the chart's visualization.
             * @param {Object} queryResults Results returned from a Neon query.
             * @param {Array} queryResults.data
             * @method updateMapData
             * @private
             */
            var updateMapData = function(database, table, queryResults) {
                var data = queryResults.data;
                var initializing = false;

                // Set data bounds on load
                if(!$scope.dataBounds) {
                    initializing = true;
                    $scope.dataBounds = computeDataBounds(queryResults.data);
                }

                for(var i = 0; i < $scope.options.layers.length; i++) {
                    if($scope.options.layers[i].database === database && $scope.options.layers[i].table === table && $scope.options.layers[i].olLayer) {
                        // Only use elements up to the limit of this layer; other layers for this database/table may have a higher limit.
                        data = queryResults.data.slice(0, $scope.options.layers[i].limit);

                        // Only set data and update features if all attributes exist in data
                        if($scope.map.doAttributesExist(data, $scope.options.layers[i].olLayer)) {
                            $scope.options.layers[i].error = undefined;
                            var colorMappings  = $scope.options.layers[i].olLayer.setData(angular.copy(data));

                            //Update the legend
                            var index = _.findIndex($scope.legend.layers, {
                                olLayerId: $scope.options.layers[i].olLayer.id
                            });
                            if($scope.options.layers[i].type === coreMap.Map.NODE_LAYER && _.keys(colorMappings).length) {
                                if(index >= 0) {
                                    $scope.legend.layers[index].nodeColorMappings = colorMappings.nodeColors;
                                    $scope.legend.layers[index].lineColorMappings = colorMappings.lineColors;
                                } else {
                                    $scope.legend.layers.push({
                                        layerName: $scope.options.layers[i].name,
                                        olLayerId: $scope.options.layers[i].olLayer.id,
                                        display: true,
                                        nodeColorMappings: colorMappings.nodeColors,
                                        lineColorMappings: colorMappings.lineColors
                                    });
                                }
                            } else if(_.keys(colorMappings).length) {
                                if(index >= 0) {
                                    $scope.legend.layers[index].colorMappings = colorMappings;
                                } else {
                                    $scope.legend.layers.push({
                                        layerName: $scope.options.layers[i].name,
                                        olLayerId: $scope.options.layers[i].olLayer.id,
                                        display: true,
                                        colorMappings: colorMappings
                                    });
                                }
                            }

                            if(external.services.point) {
                                var linksSource = generatePointLinksSource(database, table);
                                createExternalLinks(data, linksSource, $scope.options.layers[i].latitudeMapping, $scope.options.layers[i].longitudeMapping);
                                $scope.options.layers[i].olLayer.linksSource = linksSource;
                            }
                        } else {
                            $scope.options.layers[i].error = "Error - cannot create layer due to missing fields in data";
                        }

                        $scope.options.layers[i].dataLength = queryResults.data.length;
                    }
                }

                if(initializing) {
                    $scope.setDefaultView();
                }
            };

            /**
             * Zooms the map to the current data bounds
             */
            var zoomToDataBounds = function() {
                $scope.map.zoomToBounds($scope.dataBounds);
            };

            /**
             * Computes the minimum bounding rectangle to bound the data
             * @param {Array} data
             * @method computeDataBounds
             * @return {Object} Returns object with keys 'left', 'bottom', 'right', and 'top' representing the minimum lat/lon bounds
             */
            var computeDataBounds = function(data) {
                if(data && data.length === 0) {
                    return {
                        left: -180,
                        bottom: -90,
                        right: 180,
                        top: 90
                    };
                } else if(data) {
                    var bounds = {
                        minLon: 180,
                        minLat: 90,
                        maxLon: -180,
                        maxLat: -90
                    };

                    $scope.options.layers.forEach(function(layer) {
                        var latMapping = layer.latitudeMapping ? layer.latitudeMapping : coreMap.Map.Layer.HeatmapLayer.DEFAULT_LATITUDE_MAPPING;
                        var lonMapping = layer.longitudeMapping ? layer.longitudeMapping : coreMap.Map.Layer.HeatmapLayer.DEFAULT_LONGITUDE_MAPPING;

                        if(layer.type === coreMap.Map.NODE_LAYER) {
                            var sourceMapping = layer.sourceMapping ? layer.sourceMapping : coreMap.Map.Layer.NodeLayer.DEFAULT_SOURCE;
                            var targetMapping = layer.targetMapping ? layer.targetMapping : coreMap.Map.Layer.NodeLayer.DEFAULT_TARGET;

                            data.forEach(function(d) {
                                var lat = $scope.helpers.getNestedValue(d, targetMapping)[latMapping];
                                var lon = $scope.helpers.getNestedValue(d, targetMapping)[lonMapping];
                                bounds = calculateMinMaxBounds(bounds, lat, lon);

                                lat = $scope.helpers.getNestedValue(d, sourceMapping)[latMapping];
                                lon = $scope.helpers.getNestedValue(d, sourceMapping)[lonMapping];
                                bounds = calculateMinMaxBounds(bounds, lat, lon);
                            });
                        } else {
                            data.forEach(function(d) {
                                var lat = $scope.helpers.getNestedValue(d, latMapping);
                                var lon = $scope.helpers.getNestedValue(d, lonMapping);
                                bounds = calculateMinMaxBounds(bounds, lat, lon);
                            });
                        }
                    });

                    return {
                        left: bounds.minLon === 180 ? -180 : bounds.minLon,
                        bottom: bounds.minLat === 90 ? -90 : bounds.minLat,
                        right: bounds.maxLon === -180 ? 180 : bounds.maxLon,
                        top: bounds.maxLat === -90 ? 90 : bounds.maxLat
                    };
                }
            };

            /**
             * Calculates the new minimum lat/lon values based on the current bounds and the new lat and lon values.
             * @param {Object} bounds Object of latitude and longitude values representing bounds
             * @param {Number} bounds.maxLat The maximum latitude value
             * @param {Number} bounds.maxLon The maximum longitude value
             * @param {Number} bounds.minLat The minimum latitude value
             * @param {Number} bounds.minLon The minimum longitude value
             * @param {Number} lat Latitude to compare bounds against
             * @param {Number} lon Longitude to compare bounds against
             * @method calculateMinMaxBounds
             * @return {Object} Returns bounds with updated lat/lons
             */
            var calculateMinMaxBounds = function(bounds, lat, lon) {
                if($.isNumeric(lat) && $.isNumeric(lon)) {
                    if(lon < bounds.minLon) {
                        bounds.minLon = lon;
                    }
                    if(lon > bounds.maxLon) {
                        bounds.maxLon = lon;
                    }
                    if(lat < bounds.minLat) {
                        bounds.minLat = lat;
                    }
                    if(lat > bounds.maxLat) {
                        bounds.maxLat = lat;
                    }
                }

                return bounds;
            };

            /**
             * Creates the external links for the given data and source with the given latitude and longitude fields.
             * @param {Array} data
             * @param {String} source
             * @param {String} latitudeField
             * @param {String} longitudeField
             * @method createExternalLinks
             * @private
             */
            var createExternalLinks = function(data, source, latitudeField, longitudeField) {
                var mapLinks = [];

                data.forEach(function(row) {
                    var latitudeValue = $scope.helpers.getNestedValue(row, latitudeField);
                    var longitudeValue = $scope.helpers.getNestedValue(row, longitudeField);
                    var rowLinks = [];

                    if(external.services.point) {
                        Object.keys(external.services.point.apps).forEach(function(app) {
                            var linkData = {};
                            linkData[neonMappings.POINT] = {};
                            linkData[neonMappings.POINT][neonMappings.LATITUDE] = latitudeValue;
                            linkData[neonMappings.POINT][neonMappings.LONGITUDE] = longitudeValue;
                            rowLinks.push(linksPopupService.createServiceLinkObjectWithData(external.services.point, app, linkData));
                        });
                    }

                    mapLinks[linksPopupService.generatePointKey(latitudeValue, longitudeValue)] = rowLinks;
                });

                // Set the link data for the links popup for this visualization.
                linksPopupService.setLinks(source, mapLinks);
            };

            var buildPointQuery = function(database, table) {
                var latitudesAndLongitudes = [];
                var fields = {
                    _id: true
                };
                var limit;

                var addField = function(field) {
                    if(field) {
                        fields[field] = true;
                    }
                };

                $scope.options.layers.forEach(function(layer) {
                    if(layer.database === database && layer.table === table) {
                        latitudesAndLongitudes.push({
                            latitude: layer.latitudeMapping,
                            longitude: layer.longitudeMapping
                        });

                        // TODO Not sure whether to use categoryMapping or colorBy, date or dateMapping, etc.
                        addField(layer.categoryMapping);
                        addField(layer.colorBy);
                        addField(layer.date);
                        addField(layer.dateMapping);
                        addField(layer.latitudeMapping);
                        addField(layer.longitudeMapping);
                        addField(layer.sizeBy);
                        addField(layer.sizeMapping);
                        addField(layer.sourceMapping);
                        addField(layer.targetMapping);
                        addField(layer.weightMapping);
                        addField(layer.nodeColorBy);
                        addField(layer.lineColorBy);

                        if(layer.popupFields) {
                            layer.popupFields.forEach(function(popupField) {
                                addField(popupField);
                            });
                        }

                        // Use the highest limit for the query from all layers for the given database/table; only the first X elements will be used for each layer based on the limit of the layer.
                        limit = limit ? Math.max(limit, layer.limit) : layer.limit;
                    }
                });

                var query = new neon.query.Query().selectFrom(database, table).limit(limit || $scope.DEFAULT_LIMIT).withFields(Object.keys(fields));
                if(datasetService.getActiveDatasetOptions().checkForNullCoordinates) {
                    var filterClauses = latitudesAndLongitudes.map(function(element) {
                        return neon.query.and(neon.query.where(element.latitude, "!=", null), neon.query.where(element.longitude, "!=", null));
                    });
                    return query.where(neon.query.or.apply(neon.query, filterClauses));
                }
                return query;
            };

            /**
             * Creates and returns a filter on the given latitude/longitude fields using the extent set by this visualization.
             * @param {Object} databaseAndTableName Contains the database and table name
             * @param {Array} fieldNames An array containing the names of the latitude and longitude fields (as its first and
             * second elements) on which to filter. It may contain two sets of latitude and longitude fields in which case the
             * third and fourth elements contain the next latitude and longitude fields, respectively.
             * @method createFilterClauseForExtent
             * @private
             * @return {Object} A neon.query.Filter object
             */
            var createFilterClauseForExtent = function(databaseAndTableName, fieldNames) {
                if(fieldNames.length === 2) {
                    return createFilterClauseForFields(fieldNames[0], fieldNames[1]);
                } else if(fieldNames.length === 4) {
                    var clauses = [createFilterClauseForFields(fieldNames[0], fieldNames[1]), createFilterClauseForFields(fieldNames[2], fieldNames[3])];
                    return neon.query.and.apply(neon.query, clauses);
                }
            };

            /**
             * Creates and returns a filter on the given latitude/longitude fields
             * @param {String} latitudeFieldName The name of the latitude field
             * @param {String} longitudeFieldName The name of the longitude field
             * @method createFilterClauseForFields
             * @return {Object} A neon.query.Filter object
             */
            var createFilterClauseForFields = function(latitudeFieldName, longitudeFieldName) {
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
             * @param {boolean} updateLayers True, to update the map and layers after the filters are cleared
             * false to simply clear the filters
             * @method clearFilters
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

                var activeLayers = _.filter($scope.options.layers, function(layer) {
                    return layer.active;
                });

                if(activeLayers.length) {
                    // Update our table queries for the various layers.  Defer via recursion
                    // until we've received responses from our filter requests.
                    if(updateLayers) {
                        clearFiltersRecursively(activeLayers, function() {
                            clearZoomRect();
                            clearExtent();
                            queryAllLayerTables();
                        });
                    } else {
                        clearFiltersRecursively(activeLayers);
                    }
                } else {
                    clearZoomRect();
                    clearExtent();
                }
            };

            var clearFiltersRecursively = function(layers, callback) {
                var layer = layers.shift();
                filterService.removeFilter(layer.database, layer.table, getLatLonMappings(layer), function() {
                    if(layers.length) {
                        clearFiltersRecursively(layers, callback);
                    } else if(callback) {
                        callback();
                    }
                }, function() {
                    if(layers.length) {
                        clearFiltersRecursively(layers, callback);
                    } else if(callback) {
                        callback();
                    }
                }, $scope.messenger);
            };

            var clearExtent = function() {
                $scope.extent = undefined;
                $scope.error = "";
                linksPopupService.deleteLinks($scope.mapId);
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
                var layersToUpdate = [];

                $scope.options.layers.forEach(function(element) {
                    // Ensure all map layers with the same database/table as the given layer have the same active status.
                    if(element.database === layer.database && element.table === layer.table) {
                        element.active = layer.active;
                        layersToUpdate.push(element);
                    }
                });

                if($scope.zoomRectId) {
                    if(layer.active) {
                        addFilters(layersToUpdate);
                    } else {
                        clearFiltersRecursively(layersToUpdate, function() {
                            if(layersToUpdate.length === $scope.options.layers.length) {
                                clearZoomRect();
                                clearExtent();
                            }
                            queryForMapData(layer.database, layer.table);
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
             * @private
             */
            var createPoint = function(msg) {
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

                            point = new OpenLayers.Geometry.Point($scope.helpers.getNestedValue(msg.data, lonMapping), $scope.helpers.getNestedValue(msg.data, latMapping));
                            point.transform(coreMap.Map.SOURCE_PROJECTION, coreMap.Map.DESTINATION_PROJECTION);

                            feature = new OpenLayers.Feature.Vector(point);
                            feature.attributes = msg.data;

                            features.push(feature);
                        }

                        layer.addFeatures(features);
                    } else {
                        var pointsLayer = _.find(datasetService.getMapLayers($scope.bindConfig), {
                            type: coreMap.Map.POINTS_LAYER,
                            database: msg.database,
                            table: msg.table
                        });

                        if(pointsLayer) {
                            latMapping = pointsLayer.latitudeMapping;
                            lonMapping = pointsLayer.longitudeMapping;
                        }

                        point = new OpenLayers.Geometry.Point($scope.helpers.getNestedValue(msg.data, lonMapping), $scope.helpers.getNestedValue(msg.data, latMapping));
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
                var mapConfig = datasetService.getMapConfig($scope.bindConfig);
                if(mapConfig && mapConfig.bounds) {
                    $scope.map.zoomToBounds(mapConfig.bounds);
                } else if($scope.dataBounds) {
                    zoomToDataBounds();
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
                layer.nodeColorBy = layer.nodeColorField.columnName;
                layer.lineColorBy = layer.lineColorField.columnName;
                return layer;
            };

            /**
             * Updates the given layer by recreating it in the map.
             * @param {Object} layer
             * @method updateLayer
             */
            $scope.updateLayer = function(layer) {
                var previousLayer = _.clone(layer);
                var legendIndex = _.findIndex($scope.legend.layers, {
                    olLayerId: layer.olLayer.id
                });

                layer.name = (layer.name || layer.table).toUpperCase();
                layer = updateLayerFieldMappings(layer);

                var index;
                if(layer.olLayer) {
                    this.map.removeLayer(layer.olLayer);
                    layer.olLayer = undefined;
                }

                layer.editing = false;
                layer.olLayer = addLayer(layer);
                if(legendIndex >= 0) {
                    $scope.legend.layers[legendIndex].olLayerId = layer.olLayer.id;
                }
                $scope.map.setLayerVisibility(layer.olLayer.id, layer.visible);

                if($scope.zoomRectId && !areSimilarLayers(previousLayer)) {
                    clearFiltersRecursively([previousLayer], function() {
                        if($scope.zoomRectId) {
                            $scope.updateFilteringOnLayer(layer);
                        } else {
                            queryForMapData(layer.database, layer.table);
                        }
                    });
                } else if($scope.zoomRectId) {
                    $scope.updateFilteringOnLayer(layer);
                } else {
                    queryForMapData(layer.database, layer.table);
                }
            };

            /*
             * Finds if any layers match the given layers database, table, and latitude/longitude mappings.
             * @param {Object} layer
             * @method areSimilarLayers
             * @private
             */
            var areSimilarLayers = function(layer) {
                for(var i = 0; i < $scope.options.layers.length; i++) {
                    if($scope.options.layers[i].database === layer.database && $scope.options.layers[i].table === layer.table) {
                        if($scope.options.layers[i].type === coreMap.Map.NODE_LAYER && layer.type === coreMap.Map.NODE_LAYER) {
                            if($scope.options.layers[i].sourceMapping === layer.sourceMapping &&
                                $scope.options.layers[i].targetMapping === layer.targetMapping &&
                                $scope.options.layers[i].latitudeMapping === layer.latitudeMapping &&
                                $scope.options.layers[i].longitudeMapping === layer.longitudeMapping) {
                                return true;
                            }
                        } else if($scope.options.layers[i].type !== coreMap.Map.NODE_LAYER && layer.type !== coreMap.Map.NODE_LAYER) {
                            if($scope.options.layers[i].latitudeMapping === layer.latitudeMapping &&
                                $scope.options.layers[i].longitudeMapping === layer.longitudeMapping) {
                                return true;
                            }
                        }
                    }
                }
                return false;
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
                        database: layer.database,
                        table: layer.table,
                        colors: layer.colorBy ? datasetService.getActiveDatasetColorMaps(layer.database, layer.table, layer.colorBy) || {} : {},
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
                        database: layer.database,
                        table: layer.table,
                        colors: layer.colorBy ? datasetService.getActiveDatasetColorMaps(layer.database, layer.table, layer.colorBy) || {} : {},
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
                        sizeMapping: layer.sizeBy,
                        gradients: generateGradientList(layer)
                    });
                    $scope.map.addLayer(layer.olLayer);
                } else if(layer.type === coreMap.Map.NODE_LAYER) {
                    layer.olLayer = new coreMap.Map.Layer.NodeLayer(layer.name, {
                        sourceMapping: layer.sourceMapping,
                        targetMapping: layer.targetMapping,
                        weightMapping: layer.weightMapping,
                        latitudeMapping: layer.latitudeMapping,
                        longitudeMapping: layer.longitudeMapping,
                        dateMapping: mappings.date,
                        nodeMapping: layer.nodeColorBy,
                        lineMapping: layer.lineColorBy,
                        nodeDefaultColor: layer.nodeDefaultColor,
                        lineDefaultColor: layer.lineDefaultColor
                    });
                    $scope.map.addLayer(layer.olLayer);
                }

                return layer.olLayer;
            };

            var generateGradientList = function(layer) {
                return (layer.gradient1 ? [layer.gradient1] : [])
                    .concat((layer.gradient2 ? [layer.gradient2] : []))
                    .concat((layer.gradient3 ? [layer.gradient3] : []))
                    .concat((layer.gradient4 ? [layer.gradient4] : []))
                    .concat((layer.gradient5 ? [layer.gradient5] : []));
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
                // Remove layer from the legend
                var index = _.findIndex($scope.legend.layers, {
                    olLayerId: layer.olLayer.id
                });
                if(index >= 0) {
                    $scope.legend.layers.splice(index, 1);
                }

                // Remove layer from the map.
                $scope.map.removeLayer(layer.olLayer);

                // Remove layer from the global list of layers.
                index = _.findIndex($scope.options.layers, function(element) {
                    return element.olLayer.id === layer.olLayer.id;
                });
                $scope.options.layers.splice(index, 1);
                if($scope.zoomRectId && !areSimilarLayers(layer)) {
                    clearFiltersRecursively([layer], function() {
                        queryForMapData(layer.database, layer.table);
                    });
                } else {
                    queryForMapData(layer.database, layer.table);
                }
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
                    databasePrettyName: datasetService.getPrettyNameForDatabase($scope.options.newLayer.database.name),
                    table: $scope.options.newLayer.table.name,
                    tablePrettyName: datasetService.getPrettyNameForTable($scope.options.newLayer.database.name, $scope.options.newLayer.table.name),
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
                    nodeColorField: $scope.options.newLayer.nodeColorBy,
                    nodeColorBy: $scope.options.newLayer.nodeColorBy.columnName,
                    lineColorField: $scope.options.newLayer.lineColorBy,
                    lineColorBy: $scope.options.newLayer.lineColorBy.columnName,
                    nodeDefaultColor: $scope.options.newLayer.nodeDefaultColor,
                    lineDefaultColor: $scope.options.newLayer.lineDefaultColor,
                    gradient1: $scope.options.newLayer.gradient1,
                    gradient2: $scope.options.newLayer.gradient2,
                    gradient3: $scope.options.newLayer.gradient3,
                    gradient4: $scope.options.newLayer.gradient4,
                    gradient5: $scope.options.newLayer.gradient5,
                    popupFields: $scope.options.newLayer.popupFields,
                    active: $scope.options.newLayer.active,
                    visible: $scope.options.newLayer.visible,
                    valid: true,
                    editing: false
                };

                layer.olLayer = addLayer(layer);
                $scope.options.layers.push(layer);

                if(!$scope.outstandingQuery[layer.database]) {
                    $scope.outstandingQuery[layer.database] = {};
                    $scope.outstandingQuery[layer.database][layer.table] = undefined;
                } else if($scope.outstandingQuery[layer.database] && !$scope.outstandingQuery[layer.database][layer.table]) {
                    $scope.outstandingQuery[layer.database][layer.table] = undefined;
                }

                if($scope.zoomRectId) {
                    $scope.updateFilteringOnLayer(layer);
                } else {
                    queryForMapData(layer.database, layer.table);
                }

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

            /**
             * Updates the color of the base layer in the map using the base layer color from the global options.
             * @method updateBaseLayerColor
             */
            $scope.updateBaseLayerColor = function() {
                if($scope.map) {
                    $scope.map.setBaseLayerColor($scope.options.baseLayerColor);
                }
            };

            var onThemeChanged = function(theme) {
                if(theme.type !== $scope.options.baseLayerColor) {
                    $scope.options.baseLayerColor = theme.type;
                    $scope.updateBaseLayerColor();
                }
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
                        var query = buildPointQuery(keys[i], tables[j]);
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

            /**
             * Creates and returns an object that contains all the binding fields needed to recreate the visualization's state.
             * @return {Object}
             * @method bindFields
             * @private
             */
            var bindFields = function() {
                var layers = [];
                _.each($scope.options.layers, function(layer) {
                    var editedLayer = {
                        database: layer.database,
                        table: layer.table,
                        active: layer.active,
                        name: layer.name,
                        limit: layer.limit
                    };

                    if(layer.type === coreMap.Map.POINTS_LAYER) {
                        editedLayer.type = coreMap.Map.POINTS_LAYER;
                        editedLayer.latitudeMapping = layer.latitudeMapping;
                        editedLayer.longitudeMapping = layer.longitudeMapping;
                        editedLayer.colorBy = layer.colorBy;
                        editedLayer.sizeBy = layer.sizeBy;
                        editedLayer.defaultColor = layer.defaultColor;
                        editedLayer.gradient = layer.gradient;
                    } else if(layer.type === coreMap.Map.CLUSTER_LAYER) {
                        editedLayer.type = coreMap.Map.CLUSTER_LAYER;
                        editedLayer.latitudeMapping = layer.latitudeMapping;
                        editedLayer.longitudeMapping = layer.longitudeMapping;
                        editedLayer.colorBy = layer.colorBy;
                        editedLayer.defaultColor = layer.defaultColor;
                        editedLayer.popupFields = layer.popupFields;
                    } else if(layer.type === coreMap.Map.HEATMAP_LAYER) {
                        editedLayer.type = coreMap.Map.HEATMAP_LAYER;
                        editedLayer.latitudeMapping = layer.latitudeMapping;
                        editedLayer.longitudeMapping = layer.longitudeMapping;
                        editedLayer.sizeBy = layer.sizeBy;
                    } else if(layer.type === coreMap.Map.NODE_LAYER) {
                        editedLayer.type = coreMap.Map.NODE_LAYER;
                        editedLayer.latitudeMapping = layer.latitudeMapping;
                        editedLayer.longitudeMapping = layer.longitudeMapping;
                        editedLayer.sourceMapping = layer.sourceMapping;
                        editedLayer.targetMapping = layer.targetMapping;
                        editedLayer.weightMapping = layer.weightMapping;
                        editedLayer.nodeColorBy = layer.nodeColorBy;
                        editedLayer.lineColorBy = layer.lineColorBy;
                        editedLayer.nodeDefaultColor = layer.nodeDefaultColor;
                        editedLayer.lineDefaultColor = layer.lineDefaultColor;
                    }
                    layers.push(editedLayer);
                });
                datasetService.setMapLayers(layers);
                return {};
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                initialize();
                displayActiveDataset();
            });
        }
    };
}]);
