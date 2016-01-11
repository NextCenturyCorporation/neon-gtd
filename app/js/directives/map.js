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
.directive('map', ['external', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService', 'LinksPopupService', '$timeout', '$filter',
    function(external, connectionService, datasetService, errorNotificationService, filterService, exportService, linksPopupService, $timeout, $filter) {
    return {
        templateUrl: 'partials/directives/map.html',
        restrict: 'EA',
        scope: {
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
                            text += " limit " + $filter('number')(limits[i]);
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

                var query = new neon.query.Query().selectFrom(database, table).where("_id", "=", id);

                connection.executeQuery(query, function(results) {
                    callback(results.data.length ? results.data[0] : {});
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

                $scope.messenger.subscribe(filterService.REQUEST_REMOVE_FILTER, removeFilters);

                $scope.linkyConfig = datasetService.getLinkyConfig();

                $scope.messenger.subscribe('date_selected', onDateSelected);

                $scope.messenger.subscribe("theme_changed", onThemeChanged);

                $('.legend-container .legend').on({
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
                    $scope.messenger.removeEvents();
                    if($scope.extent) {
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

                var resizeLegend = function() {
                    var container = $element.find(".legend-container");
                    var containerCss = parseInt(container.css("margin-top").replace("px", "")) +
                            parseInt(container.css("margin-bottom").replace("px", "")) +
                            parseInt(container.css("padding-top").replace("px", "")) +
                            parseInt(container.css("padding-bottom").replace("px", ""));

                    var legend = container.find(".legend");
                    var legendCss = parseInt(legend.css("margin-top").replace("px", "")) +
                            parseInt(legend.css("margin-bottom").replace("px", "")) +
                            parseInt(legend.css("padding-top").replace("px", "")) +
                            parseInt(legend.css("padding-bottom").replace("px", ""));

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

            /*
             * Given a list of keys, finds all that are used by the map and removes them.
             * @param {Array} keys A list of filter keys
             * longitudeMapping.
             * @method removeFilters
             * @private
             */
            var removeFilters = function(keys) {
                var filterKeysList = [];
                var databasesAndTables = [];

                _.each($scope.options.layers, function(layer) {
                    var keyObj = $scope.filterKeys[layer.database][layer.table][getFilterLatLonKey(layer)];

                    if(keys.indexOf(keyObj.filterKey) !== -1) {
                        if(!_.contains(filterKeysList, keyObj.filterKey)) {
                            filterKeysList.push(keyObj.filterKey);
                            var containsDatabaseTableCombo = _.contains(databasesAndTables, {
                                database: layer.database,
                                table: layer.table
                            });

                            if(!containsDatabaseTableCombo) {
                                databasesAndTables.push({
                                    database: layer.database,
                                    table: layer.table
                                });
                            }

                            // Retrieve all relation keys to remove as well
                            _.forEach(keyObj.relations, function(tableObj, databaseName) {
                                _.forEach(tableObj, function(relationKey, tableName) {
                                    filterKeysList.push(relationKey);
                                });
                            });
                        }
                        layer.active = false;
                    }
                });

                if(filterKeysList) {
                    clearFiltersRecursively(filterKeysList, function() {
                        _.each(databasesAndTables, function(obj) {
                            $scope.queryForMapData(obj.database, obj.table);
                        });
                    });
                }
            };

            $scope.getBoundsKeyForLinksPopupButton = function() {
                return $scope.extent ? linksPopupService.generateBoundsKey($scope.extent.minimumLatitude, $scope.extent.minimumLongitude, $scope.extent.maximumLatitude, $scope.extent.maximumLongitude) : "";
            };

            /**
             * Adds the current map filter to all active map layers, or any layers with the given filter keys, queries for
             * map data, and redraws the layers on the map.
             * @param {Array} [filterKeysList] Optional list of filter keys to add
             * @method addFilters
             * @private
             */
            var addFilters = function(filterKeysList) {
                var filterKeys = [];

                if(filterKeysList) {
                    _.forEach($scope.filterKeys, function(tableObj, database) {
                        _.forEach(tableObj, function(latLonObj, table) {
                            _.forEach(latLonObj, function(keyObj, latLonMapping) {
                                if(filterKeysList.indexOf(keyObj.filterKey) >= 0) {
                                    var latLon = latLonMapping.split(",");
                                    var filterKeyObj = createDatabaseTableObject(database, table, keyObj.filterKey);

                                    if(latLon.length === 2) {
                                        filterKeys.push({
                                            latitudeMappings: [latLon[0]],
                                            longitudeMappings: [latLon[1]],
                                            database: database,
                                            table: table,
                                            filterKey: _.merge(filterKeyObj, keyObj.relations)
                                        });
                                    } else if(latLon.length === 4) {
                                        filterKeys.push({
                                            latitudeMappings: [latLon[0], latLon[2]],
                                            longitudeMappings: [latLon[1], latLon[3]],
                                            database: database,
                                            table: table,
                                            filterKey: _.merge(filterKeyObj, keyObj.relations)
                                        });
                                    }
                                }
                            });
                        });
                    });
                } else {
                    filterKeys = getActiveLayersFilterKeys();
                }

                if(filterKeys.length > 0) {
                    filterActiveLayersRecursively(filterKeys, function() {
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

            /*
             * Finds all active layers and returns a unique list of the filter keys, database, table, latitude mapping,
             * and longitude mapping.
             * @return {Array} A list of objects containing keys with filterKey, table, database, latitudeMapping, and
             * longitudeMapping.
             * @method getActiveLayersFilterKeys
             * @private
             */
            var getActiveLayersFilterKeys = function() {
                var filterKeys = [];

                for(var i = 0; i < $scope.options.layers.length; i++) {
                    if($scope.options.layers[i].active) {
                        var database = $scope.options.layers[i].database;
                        var table = $scope.options.layers[i].table;
                        var latLonKey = getFilterLatLonKey($scope.options.layers[i]);
                        var latitudeMappings = [];
                        var longitudeMappings = [];
                        _.forEach(latLonKey.split(","), function(coordinate, index) {
                            if(index % 2 === 0) {
                                latitudeMappings.push(coordinate);
                            } else {
                                longitudeMappings.push(coordinate);
                            }
                        });

                        var index = _.findIndex(filterKeys, {
                                latitudeMappings: latitudeMappings,
                                longitudeMappings: longitudeMappings,
                                database: database,
                                table: table
                            });

                        if(index === -1) {
                            var filterKey = createDatabaseTableObject(database, table, $scope.filterKeys[database][table][latLonKey].filterKey);
                            filterKeys.push({
                                latitudeMappings: latitudeMappings,
                                longitudeMappings: longitudeMappings,
                                database: database,
                                table: table,
                                filterKey: _.merge(filterKey, $scope.filterKeys[database][table][latLonKey].relations)
                            });
                        }
                    }
                }

                return filterKeys;
            };

            /*
             * Returns a map of a database name to a table name that contains the given key.
             * @method createDatabaseTableObject
             * @return {Object}
             */
            var createDatabaseTableObject = function(database, table, key) {
                var obj = {};
                obj[database] = {};
                obj[database][table] = key;
                return obj;
            };

            /**
             * This method will apply filters to all actively filtering layers and trigger a single
             * callback after all filters have been applied.
             * @method filterActiveLayersRecursively
             * @private
             */
            var filterActiveLayersRecursively = function(activeFilterKeys, callback) {
                var filter = activeFilterKeys.shift();
                var coordinatesRelations = [filter.latitudeMappings[0], filter.longitudeMappings[0]];
                if(filter.latitudeMappings.length === 2) {
                    coordinatesRelations.push(filter.latitudeMappings[1]);
                    coordinatesRelations.push(filter.longitudeMappings[1]);
                }
                var relations = datasetService.getRelations(filter.database, filter.table, coordinatesRelations);
                filterService.replaceFilters($scope.messenger, relations, filter.filterKey, createFilterClauseForExtent, {
                    visName: "Map"
                }, function() {
                    if(activeFilterKeys.length) {
                        filterActiveLayersRecursively(activeFilterKeys, callback);
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

            var findField = function(fields, fieldName) {
                return _.find(fields, function(field) {
                    return field.columnName === fieldName;
                }) || datasetService.createBlankField();
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
                layer.nodeColorField = findField(layer.fields, layer.nodeColorBy);
                layer.lineColorField = findField(layer.fields, layer.lineColorBy);

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

                $scope.options.layers = cloneDatasetLayerConfig();
                $scope.limitedLayers = {};

                // Setup the base layer objects.
                for(i = 0; i < $scope.options.layers.length; i++) {
                    layer = $scope.options.layers[i];
                    if(!layer.olLayer) {
                        layer.olLayer = addLayer(layer);
                        setFilterKey(layer);
                    }
                }

                // Make the necessary table queries.
                if($scope.showFilter) {
                    $scope.clearFilters(true);
                } else {
                    queryAllLayerTables();
                }
            };

            /*
             * Adds a new filter key, if it doesn't exist already, for the given layer.
             * @method setFilterKey
             * @private
             */
            var setFilterKey = function(layer) {
                var filterKeys = filterService.createFilterKeys("map", datasetService.getDatabaseAndTableNames());
                var database = layer.database;
                var table = layer.table;
                var latLonKey = getFilterLatLonKey(layer);
                var relations = datasetService.getRelations(database, table, [layer.latitudeMapping, layer.longitudeMapping]);
                var relationKeys = {};

                _.each(relations, function(relation) {
                    var relationDatabase = relation.database;
                    var relationTable = relation.table;

                    if(relationDatabase !== database || relationTable !== table) {
                        if(!relationKeys[relationDatabase]) {
                            relationKeys[relationDatabase] = {};
                        }
                        if(!relationKeys[relationDatabase][relationTable]) {
                            relationKeys[relationDatabase][relationTable] = filterKeys[relationDatabase][relationTable];
                        }
                    }
                });

                if(!$scope.filterKeys[database]) {
                    $scope.filterKeys[database] = {};
                }
                if(!$scope.filterKeys[database][table]) {
                    $scope.filterKeys[database][table] = {};
                }
                if(!$scope.filterKeys[database][table][latLonKey]) {
                    $scope.filterKeys[database][table][latLonKey] = {};
                    $scope.filterKeys[database][table][latLonKey].filterKey = filterKeys[database][table];
                    $scope.filterKeys[database][table][latLonKey].relations = relationKeys;
                }
            };

            /*
             * Creates a latitude and longitude key for filterKeys
             * @param layer
             * @method getFilterLatLonKey
             * @private
             */
            var getFilterLatLonKey = function(layer) {
                if(layer.type === "node") {
                    var sourceMapping = layer.sourceMapping + "." + layer.latitudeMapping + "," + layer.sourceMapping + "." + layer.longitudeMapping;
                    var targetMapping = layer.targetMapping + "." + layer.latitudeMapping + "," + layer.targetMapping + "." + layer.longitudeMapping;
                    return sourceMapping + "," + targetMapping;
                } else {
                    return layer.latitudeMapping + "," + layer.longitudeMapping;
                }
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

                $scope.dataLength = data.length;
                for(var i = 0; i < $scope.options.layers.length; i++) {
                    if($scope.options.layers[i].database === database && $scope.options.layers[i].table === table && $scope.options.layers[i].olLayer) {
                        // Only use elements up to the limit of this layer; other layers for this database/table may have a higher limit.
                        var limit = $scope.options.layers[i].limit;
                        data = queryResults.data.slice(0, limit);

                        // Only set data and update features if all attributes exist in data
                        if($scope.map.doAttributesExist(data, $scope.options.layers[i].olLayer)) {
                            $scope.options.layers[i].error = undefined;
                            var colorMappings  = $scope.options.layers[i].olLayer.setData(angular.copy(data));

                            //Update the legend
                            var index = _.findIndex($scope.legend.layers, {
                                olLayerId: $scope.options.layers[i].olLayer.id
                            });
                            if($scope.options.layers[i].type === "node" && _.keys(colorMappings).length) {
                                if(index >= 0) {
                                    $scope.legend.layers[index].nodeColorMappings = colorMappings.nodeColors;
                                    $scope.legend.layers[index].lineColorMappings = colorMappings.lineColors;
                                } else {
                                    $scope.legend.layers.push({
                                        layerName: $scope.options.layers[i].name,
                                        olLayerId: $scope.options.layers[i].olLayer.id,
                                        display: false,
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
                                        display: false,
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

                        if(layer.type === "node") {
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

                var activeFilterKeys = _.map(getActiveLayersFilterKeys(), function(obj) {
                    return obj.filterKey;
                });

                if(activeFilterKeys.length) {
                    // Update our table queries for the various layers.  Defer via recursion
                    // until we've received responses from our filter requests.
                    if(updateLayers) {
                        clearFiltersRecursively(activeFilterKeys, function() {
                            clearZoomRect();
                            clearExtent();
                            queryAllLayerTables();
                        });
                    } else {
                        clearFiltersRecursively(activeFilterKeys);
                    }
                } else {
                    clearZoomRect();
                    clearExtent();
                }
            };

            var clearFiltersRecursively = function(filterKeysList, callback) {
                var filterKeys = filterKeysList.shift();
                if(_.isString(filterKeys)) {
                    filterKeys = [filterKeys];
                }
                removeFiltersForKeys(filterKeys, function() {
                    if(filterKeysList.length) {
                        clearFiltersRecursively(filterKeysList, callback);
                    } else if(callback) {
                        callback();
                    }
                });
            };

            var clearExtent = function() {
                $scope.extent = undefined;
                $scope.error = "";
                linksPopupService.deleteLinks($scope.mapId);
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
                var filterKeyList = [];
                var databasesAndTables = [];

                $scope.options.layers.forEach(function(element) {
                    // Ensure all map layers with the same database/table as the given layer have the same active status.
                    if(element.database === layer.database && element.table === layer.table) {
                        element.active = layer.active;
                        var latLonObj = $scope.filterKeys[element.database][element.table][getFilterLatLonKey(element)];
                        filterKeyList.push(latLonObj.filterKey);

                        var containsDatabaseTableCombo = _.contains(databasesAndTables, {
                            database: element.database,
                            table: element.table
                        });
                        if(!containsDatabaseTableCombo) {
                            databasesAndTables.push({
                                database: element.database,
                                table: element.table
                            });
                        }

                        _.forEach(latLonObj.relations, function(tableObj, databaseName) {
                            _.forEach(tableObj, function(relationKey, tableName) {
                                filterKeyList.push(relationKey);

                                var containsDatabaseTableCombo = _.contains(databasesAndTables, {
                                    database: databaseName,
                                    table: tableName
                                });
                                if(!containsDatabaseTableCombo) {
                                    databasesAndTables.push({
                                        database: databaseName,
                                        table: tableName
                                    });
                                }
                            });
                        });
                    }
                });

                if($scope.zoomRectId) {
                    if(layer.active) {
                        addFilters(filterKeyList);
                    } else {
                        clearFiltersRecursively(filterKeyList, function() {
                            _.each(databasesAndTables, function(obj) {
                                queryForMapData(obj.database, obj.table);
                            });
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
                        var pointsLayer = _.find(datasetService.getMapLayers(), {
                            type: "points",
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
                var mapConfig = datasetService.getMapConfig();
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
                if(layer.previousLimit !== layer.limit) {
                    if($scope.limitedLayers[layer.previousLimit]) {
                        // Remove the old limit/name.
                        index = $scope.limitedLayers[layer.previousLimit].indexOf(layer.previousName);
                        if(index >= 0) {
                            $scope.limitedLayers[layer.previousLimit].splice(index, 1);
                        }
                    }

                    // Add the new limit/name.
                    if(!$scope.limitedLayers[layer.limit]) {
                        $scope.limitedLayers[layer.limit] = [];
                    }
                    $scope.limitedLayers[layer.limit].push(layer.name);
                } else if(layer.previousName !== layer.name) {
                    if($scope.limitedLayers[layer.limit]) {
                        // Replace the old name with the new name.
                        index = $scope.limitedLayers[layer.limit].indexOf(layer.previousName);
                        if(index >= 0) {
                            $scope.limitedLayers[layer.limit].splice(index, 1, layer.name);
                        }
                    }
                }

                if(layer.olLayer) {
                    this.map.removeLayer(layer.olLayer);
                    layer.olLayer = undefined;
                }

                layer.previousName = layer.name;
                layer.previousLimit = layer.limit;
                layer.editing = false;
                setFilterKey(layer);
                layer.olLayer = addLayer(layer);
                $scope.legend.layers[legendIndex].olLayerId = layer.olLayer.id;
                $scope.map.setLayerVisibility(layer.olLayer.id, layer.visible);
                refreshFilterKeys(previousLayer, function() {
                    if($scope.zoomRectId) {
                        $scope.updateFilteringOnLayer(layer);
                    } else {
                        queryForMapData(layer.database, layer.table);
                    }
                });
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

                // Remove layer from the legend
                index = _.findIndex($scope.legend.layers, {
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
                refreshFilterKeys(layer, function() {
                    if($scope.filterKeys[layer.database] && $scope.filterKeys[layer.database][layer.table]) {
                        queryForMapData(layer.database, layer.table);
                    }
                });
            };

            /*
             * Removes the filter associated with the given layer, if not needed anymore.
             * @method refreshFilterKeys
             * @private
             */
            var refreshFilterKeys = function(layer, callback) {
                var matchingLayer = _.findWhere($scope.options.layers, {
                        database: layer.database,
                        table: layer.table,
                        latitudeMapping: layer.latitudeMapping,
                        longitudeMapping: layer.longitudeMapping
                    });

                if(!matchingLayer) {
                    var latLonObj = $scope.filterKeys[layer.database][layer.table][getFilterLatLonKey(layer)];
                    var keys = [latLonObj.filterKey];
                    _.forEach(latLonObj.relations, function(tableObj, databaseName) {
                        _.forEach(tableObj, function(relationKey, tableName) {
                            keys.push(relationKey);
                        });
                    });
                    delete $scope.filterKeys[layer.database][layer.table][getFilterLatLonKey(layer)];
                    clearFiltersRecursively(keys, function() {
                        if(callback) {
                            callback();
                        }
                    });
                } else if(callback) {
                    callback();
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
                    nodeColorField: $scope.options.newLayer.nodeColorBy,
                    nodeColorBy: $scope.options.newLayer.nodeColorBy.columnName,
                    lineColorField: $scope.options.newLayer.lineColorBy,
                    lineColorBy: $scope.options.newLayer.lineColorBy.columnName,
                    nodeDefaultColor: $scope.options.newLayer.nodeDefaultColor,
                    lineDefaultColor: $scope.options.newLayer.lineDefaultColor,
                    popupFields: $scope.options.newLayer.popupFields,
                    active: $scope.options.newLayer.active,
                    visible: $scope.options.newLayer.visible,
                    valid: true,
                    editing: false
                };

                layer.previousName = layer.name;
                layer.previousLimit = layer.limit;
                layer.olLayer = addLayer(layer);
                $scope.options.layers.push(layer);
                setFilterKey(layer);

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
             * Updates the color of the base layer in the map using the base layer color from the global options.
             * @method updateBaseLayerColor
             */
            $scope.updateBaseLayerColor = function() {
                if($scope.map) {
                    $scope.map.setBaseLayerColor($scope.options.baseLayerColor);
                }
            };

            var onThemeChanged = function(message) {
                if(message.type !== $scope.options.baseLayerColor) {
                    $scope.options.baseLayerColor = message.type;
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

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                initialize();
                displayActiveDataset();
            });
        }
    };
}]);
