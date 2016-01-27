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
 * This directive adds a D3 force directed graph.
 * @namespace neonDemo.directives
 * @class directedGraph
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('directedGraph', ['$filter', '$timeout', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'ExportService', 'VisualizationService',
function($filter, $timeout, connectionService, datasetService, errorNotificationService, exportService, visualizationService) {
    return {
        templateUrl: 'partials/directives/directedGraph.html',
        restrict: 'EA',
        scope: {
            bindTitle: '=',
            bindFeedName: '=',
            bindFeedType: '=',
            bindStateId: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            $element.addClass('directedGraphDirective');

            $scope.element = $element;

            $scope.TIMEOUT_MS = 250;

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.dataLimited = false;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.bucketizer = dateBucketizer();
            $scope.outstandingNodeQuery = undefined;
            $scope.outstandingGraphQuery = undefined;
            $scope.width = $element.outerWidth(true);
            $scope.mediator = undefined;
            $scope.existingNodeIds = [];
            $scope.selectedNodeIds = [];
            $scope.legend = [];
            $scope.helpers = neon.helpers;

            $scope.tooltip = {
                idLabel: "",
                dataLabel: "",
                nameLabel: "",
                sizeLabel: "",
                flagLabel: "",
                sourceNameLabel: "",
                targetNameLabel: "",
                sourceSizeLabel: "",
                targetSizeLabel: ""
            };

            $scope.options = {
                database: {},
                table: {},
                selectedNodeField: {},
                selectedNameField: {},
                selectedSizeField: {},
                selectedLinkedNodeField: {},
                selectedLinkedNameField: {},
                selectedLinkedSizeField: {},
                selectedDateField: {},
                selectedFlagField: {},
                selectedTextField: {},
                selectedNodeId: "",
                dataLimit: 500000,
                hideSimpleNetworks: true,
                reloadOnFilter: true,
                useNodeClusters: true,
                flagMode: ""
            };

            // Functions for the options-menu directive.
            $scope.optionsMenuButtonText = function() {
                if(!$scope.mediator || $scope.mediator.getNumberOfNodes() === 0) {
                    return "No data available";
                }
                var text = $scope.mediator.getNumberOfNodes() + " nodes";
                if($scope.bucketizer && $scope.mediator && $scope.mediator.getSelectedDateBucket()) {
                    var date = $filter("date")($scope.bucketizer.getDateForBucket($scope.mediator.getSelectedDateBucket()).toISOString(), $scope.bucketizer.getDateFormat());
                    text += " (" + date + ")";
                }
                if($scope.dataLimited) {
                    text += " [data limited]";
                }
                return text;
            };
            $scope.showOptionsMenuButtonText = function() {
                return true;
            };

            var calculateGraphHeight = function() {
                var headerHeight = 0;
                $element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                headerHeight += $element.find(".legend").outerHeight(true);
                return $element.height() - headerHeight;
            };

            var calculateGraphWidth = function() {
                return $element.width();
            };

            var updateGraphSize = function() {
                // Set the width of the title to the width of the visualization minus the width of the chart options button/text and padding.
                var titleWidth = $element.width() - $element.find(".chart-options").outerWidth(true) - 20;
                $element.find(".title").css("maxWidth", titleWidth);

                // The D3 graph will resize itself but we need to trigger that resize event by changing the height and widget of the SVG.
                // Setting the dimensions on the SVG performs better than just setting the dimensions on the directed-graph-container.
                $element.find(".directed-graph .directed-graph-container svg").attr("height", calculateGraphHeight());
                $element.find(".directed-graph .directed-graph-container svg").attr("width", calculateGraphWidth());
                return $timeout(redraw, $scope.TIMEOUT_MS);
            };

            var updateSize = function() {
                $scope.width = $element.outerWidth(true);
                if($scope.resizePromise) {
                    $timeout.cancel($scope.resizePromise);
                }
                $scope.resizePromise = updateGraphSize();
            };

            var redraw = function() {
                if($scope.graph) {
                    $scope.graph.redraw();
                }
                $scope.resizePromise = null;
            };

            var initialize = function() {
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    $scope.queryForData();
                });
                $scope.messenger.subscribe("date_bucketizer", function(message) {
                    $scope.bucketizer = message.bucketizer;
                    if($scope.mediator) {
                        $scope.mediator.setBucketizer(message.bucketizer);
                    }
                });
                $scope.messenger.subscribe("date_selected", onDateSelected);

                $scope.exportID = exportService.register($scope.makeDirectedGraphExportObject);
                visualizationService.register($scope.bindStateId, bindFields);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: "directed-graph",
                        elementType: "canvas",
                        elementSub: "directed-graph",
                        elementGroup: "graph_group",
                        source: "system",
                        tags: ["remove", "directed-graph"]
                    });
                    $element.off("resize", updateSize);
                    $element.find(".chart-options a").off("resize", updateSize);
                    $element.find(".legend").off("resize", updateSize);
                    $scope.messenger.unsubscribeAll();
                    exportService.unregister($scope.exportID);
                    visualizationService.unregister($scope.bindStateId);
                });

                $element.resize(updateSize);
                $element.find(".chart-options a").resize(updateSize);
                $element.find(".legend").resize(updateSize);
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
                    var reloadNetworkGraph = false;
                    if(message.type.toUpperCase() === "ADD" || message.type.toUpperCase() === "REPLACE") {
                        if(message.addedFilter.whereClause) {
                            selectNodeNetworkFromWhereClause(message.addedFilter.whereClause);
                        }
                        reloadNetworkGraph = $scope.options.reloadOnFilter;
                    }
                    $scope.queryForData(reloadNetworkGraph);
                }
            };

            /**
             * Selects the networks for the nodes with IDs in the given where clause (and its children) if their fields match the selected node or link fields.
             * @param {Object} A where clause containing either {String} lhs and {String} rhs or {Array} whereClauses containing other where clause Objects.
             * @method selectNodeNetworkFromWhereClause
             * @private
             */
            var selectNodeNetworkFromWhereClause = function(whereClause) {
                if(whereClause.whereClauses) {
                    for(var i = 0; i < whereClause.whereClauses.length; ++i) {
                        selectNodeNetworkFromWhereClause(whereClause.whereClauses[i]);
                    }
                } else if(whereClause.lhs && whereClause.rhs) {
                    // See if the filter is either on the node field (e.g. user) or on the linked-node field (e.g. friend).
                    if(whereClause.lhs === $scope.options.selectedNodeField.columnName) {
                        $scope.selectNodeAndNetworkFromNodeId(whereClause.rhs);
                    } else if(datasetService.isFieldValid($scope.options.selectedLinkedNodeField) && whereClause.lhs === $scope.options.selectedLinkedNodeField.columnName) {
                        $scope.selectNodeAndNetworkFromNodeId(whereClause.rhs);
                    }
                }
            };

            /**
             * Event handler for date selected events issued over Neon's messaging channels.
             * @param {Object} message A Neon date selected message.
             * @method onDateSelected
             * @private
             */
            var onDateSelected = function(message) {
                if($scope.mediator) {
                    $scope.mediator.selectDate(message.start);
                }
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             * @private
             */
            var displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset() || $scope.loadingData) {
                    return;
                }

                $scope.databases = datasetService.getDatabases();
                $scope.options.database = $scope.databases[0];

                if(initializing) {
                    $scope.updateTables();
                } else {
                    $scope.$apply(function() {
                        $scope.updateTables();
                    });
                }
            };

            /**
             * Updates the tables available in this visualization using the selected database and the active dataset.
             * @method updateTables
             */
            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.database.name);
                $scope.options.table = datasetService.getFirstTableWithMappings($scope.options.database.name, [neonMappings.GRAPH_NODE]) || $scope.tables[0];
                $scope.updateFields();
            };

            /**
             * Updates the fields available in this visualization using the selected database/table and the active dataset.
             * @method updateFields
             */
            $scope.updateFields = function() {
                $scope.loadingData = true;
                $scope.fields = datasetService.getSortedFields($scope.options.database.name, $scope.options.table.name);

                var selectedNodeField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_NODE) || "";
                $scope.options.selectedNodeField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedNodeField;
                }) || datasetService.createBlankField();
                var selectedNameField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_NODE_NAME) ||
                    datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.NEWSFEED_AUTHOR) || "";
                $scope.options.selectedNameField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedNameField;
                }) || datasetService.createBlankField();
                var selectedSizeField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_NODE_SIZE);
                $scope.options.selectedSizeField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedSizeField;
                }) || datasetService.createBlankField();
                var selectedLinkedNodeField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_LINKED_NODE) || "";
                $scope.options.selectedLinkedNodeField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedLinkedNodeField;
                }) || datasetService.createBlankField();
                var selectedLinkedNameField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_LINKED_NODE_NAME) || "";
                $scope.options.selectedLinkedNameField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedLinkedNameField;
                }) || datasetService.createBlankField();
                var selectedLinkedSizeField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_LINKED_NODE_SIZE);
                $scope.options.selectedLinkedSizeField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedLinkedSizeField;
                }) || datasetService.createBlankField();
                var selectedFlagField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_FLAG);
                $scope.options.selectedFlagField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedFlagField;
                }) || datasetService.createBlankField();
                var selectedDateField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.DATE) || "";
                $scope.options.selectedDateField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedDateField;
                }) || datasetService.createBlankField();
                var selectedTextField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.NEWSFEED_TEXT) || "";
                $scope.options.selectedTextField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedTextField;
                }) || datasetService.createBlankField();

                updateGraphDataMappings();
                $scope.selectedNodeIds = [];
                $scope.queryForData();
            };

            /**
             * Updates the options in the visualization using the graph data mappings in the selected database/table.
             * @method updateGraphDataMappings
             * @private
             */
            var updateGraphDataMappings = function() {
                $scope.options.flagMode = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_FLAG_MODE) || "";

                $scope.tooltip = {
                    idLabel: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_ID_LABEL) || "",
                    dataLabel: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_DATA_LABEL) || "",
                    nameLabel: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_NAME_LABEL) || "",
                    sizeLabel: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_SIZE_LABEL) || "",
                    flagLabel: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_FLAG_LABEL) || "",
                    sourceNameLabel: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_SOURCE_NAME_LABEL) || "",
                    targetNameLabel: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_TARGET_NAME_LABEL) || "",
                    sourceSizeLabel: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_SOURCE_SIZE_LABEL) || "",
                    targetSizeLabel: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_TARGET_SIZE_LABEL) || ""
                };
            };

            /**
             * Queries for new node list and network graph data as requested.
             * @param {Boolean} reloadNetworkGraph Whether to query for the network graph data.
             * @param {Boolean} reloadNodeList Whether to query for the node list data.
             * @method queryForData
             */
            $scope.queryForData = function(reloadNetworkGraph, reloadNodeList) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                recreateGraph();
                publishNews([]);
                publishNewsHighlights();

                var connection = connectionService.getActiveConnection();

                if(!connection || !datasetService.isFieldValid($scope.options.selectedNodeField)) {
                    $scope.loadingData = false;
                    return;
                }

                if(reloadNetworkGraph || $scope.selectedNodeIds.length) {
                    queryForNetworkGraph(connection);
                }

                if(reloadNodeList) {
                    queryForNodeList(connection);
                }
            };

            /**
             * Recreates the graph with blank graph data.  Keeps the currently selected node IDs.
             * @method recreateGraph
             * @private
             */
            var recreateGraph = function() {
                var updateSelectedNodeIdsInAngularDigest = function() {
                    $scope.$apply(function() {
                        updateSelectedNodeIds();
                    });
                };

                var redrawGraphInAngularDigest = function() {
                    $scope.$apply(function() {
                        if($scope.mediator) {
                            $scope.mediator.redrawGraph();
                        }
                    });
                };

                $scope.mediator = new mediators.DirectedGraphMediator($element[0], ".directed-graph-container", {
                    calculateGraphHeight: calculateGraphHeight,
                    calculateGraphWidth: calculateGraphWidth,
                    redrawGraph: redrawGraphInAngularDigest,
                    updateSelectedNodeIds: updateSelectedNodeIdsInAngularDigest,
                    getNestedValue: $scope.helpers.getNestedValue
                });

                $scope.mediator.setBucketizer($scope.bucketizer);
                $scope.mediator.setSelectedNodeIds($scope.selectedNodeIds);
                $scope.mediator.setTooltip($scope.tooltip);
            };

            /**
             * Updates the selected node IDs from the selected node IDs saved in the mediator and publishes a news highlights event.
             * @method updateSelectedNodeIDs
             * @private
             */
            var updateSelectedNodeIds = function() {
                $scope.selectedNodeIds = angular.copy($scope.mediator.getSelectedNodeIds());
                publishNewsHighlights();
            };

            /**
             * Publishes a news event using the given graph data.
             * @param {Array} data
             * @method publishNews
             * @private
             */
            var publishNews = function(data) {
                var news = [];
                data.forEach(function(item) {
                    var newsItem = {
                        primaryTitle: $scope.helpers.getNestedValue(item, $scope.options.selectedNodeField.columnName)
                    };
                    if(datasetService.isFieldValid($scope.options.selectedDateField)) {
                        newsItem.date = new Date($scope.helpers.getNestedValue(item, $scope.options.selectedDateField.columnName));
                    }
                    if(datasetService.isFieldValid($scope.options.selectedNameField)) {
                        newsItem.secondaryTitle = $scope.helpers.getNestedValue(item, $scope.options.selectedNameField.columnName);
                    }
                    if(datasetService.isFieldValid($scope.options.selectedTextField)) {
                        newsItem.content = $scope.helpers.getNestedValue(item, $scope.options.selectedTextField.columnName);
                        // Delete the text from the data to improve our memory preformance because we don't need it any longer.
                        delete item[$scope.options.selectedTextField.columnName];
                    }
                    news.push(newsItem);
                });

                $scope.messenger.publish("news", {
                    news: news,
                    name: $scope.bindFeedName || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.NEWSFEED_NAME) || "graph",
                    type: $scope.bindFeedType || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.NEWSFEED_TYPE) || ""
                });
            };

            /**
             * Publishes a news highlights event using the global selected nodes and network.
             * @method publishNewsHighlights
             * @private
             */
            var publishNewsHighlights = function() {
                $scope.messenger.publish("news_highlights", {
                    name: $scope.bindFeedName || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.NEWSFEED_NAME) || "graph",
                    show: {
                        primaryTitles: $scope.mediator ? $scope.mediator.getNodeIdsInSelectedNetwork() : []
                    },
                    highlights: {
                        primaryTitles: $scope.selectedNodeIds
                    }
                });
            };

            /**
             * Query for the list of nodes using the selected field but do not draw a graph.
             * @param {Object} connection
             * @method queryForNodeList
             * @private
             */
            var queryForNodeList = function(connection) {
                var query = createNodeListQuery();

                if($scope.outstandingNodeQuery) {
                    $scope.outstandingNodeQuery.abort();
                }

                $scope.outstandingNodeQuery = connection.executeQuery(query);
                $scope.outstandingNodeQuery.always(function() {
                    $scope.outstandingNodeQuery = undefined;
                });
                $scope.outstandingNodeQuery.done(function(data) {
                    for(var i = 0; i < data.data.length; i++) {
                        var nodeId = data.data[i][$scope.options.selectedNodeField.columnName];
                        if($scope.existingNodeIds.indexOf(nodeId) < 0) {
                            $scope.existingNodeIds.push(nodeId);
                        }
                    }

                    // Sort the nodes so they are displayed in alphabetical order in the options dropdown.
                    $scope.existingNodeIds.sort(function(a, b) {
                        if(typeof a === "string" && typeof b === "string") {
                            return a.toLowerCase().localeCompare(b.toLowerCase());
                        }
                        if(a < b) {
                            return -1;
                        }
                        if(b < a) {
                            return 1;
                        }
                        return 0;
                    });
                });
                $scope.outstandingNodeQuery.fail(function(response) {
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            /**
             * Creates and returns the Neon query for the node list.
             * @method createNodeListQuery
             * @private
             * @return {Object}
             */
            var createNodeListQuery = function() {
                var query = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name)
                    .withFields([$scope.options.selectedNodeField.columnName])
                    .groupBy($scope.options.selectedNodeField)
                    .aggregate(neon.query.COUNT, '*', 'count');

                return query;
            };

            /**
             * Query for the list of nodes that link to the filtered nodes and draw the graph containing the network.
             * @param {Object} connection
             * @private
             * @method queryForNetworkGraph
             */
            var queryForNetworkGraph = function(connection) {
                var query = createNetworkGraphQuery();

                if($scope.outstandingGraphQuery) {
                    $scope.outstandingGraphQuery.abort();
                }

                $scope.outstandingGraphQuery = connection.executeQuery(query);
                $scope.outstandingGraphQuery.always(function() {
                    $scope.outstandingGraphQuery = undefined;
                });
                $scope.outstandingGraphQuery.done(function(response) {
                    if(response.data.length) {
                        $scope.$apply(function() {
                            $scope.dataLimited = (response.data.length >= $scope.options.dataLimit);
                            if($scope.mediator) {
                                $scope.mediator.evaluateDataAndUpdateGraph(response.data, gatherMediatorOptions());
                                $scope.legend = $scope.mediator.createLegend($scope.options.useNodeClusters, datasetService.isFieldValid($scope.options.selectedFlagField), $scope.tooltip.flagLabel);
                            }
                            $scope.loadingData = false;
                            publishNews(response.data);
                        });
                    }
                });
                $scope.outstandingGraphQuery.fail(function(response) {
                    if(response.status !== 0) {
                        $scope.$apply(function() {
                            if($scope.mediator) {
                                $scope.mediator.saveDataAndUpdateGraph([], []);
                                $scope.legend = [];
                            }
                            $scope.loadingData = false;
                        });
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
                    }
                });
            };

            /**
             * Returns an object containing all of the graph options for the graph mediator.
             * @method gatherMediatorOptions
             * @private
             * @return {Object}
             */
            var gatherMediatorOptions = function() {
                return {
                    hideSimpleNetworks: $scope.options.hideSimpleNetworks,
                    useNodeClusters: $scope.options.useNodeClusters,
                    nodeField: datasetService.isFieldValid($scope.options.selectedNodeField) ? $scope.options.selectedNodeField.columnName : "",
                    nameField: datasetService.isFieldValid($scope.options.selectedNameField) ? $scope.options.selectedNameField.columnName : "",
                    sizeField: datasetService.isFieldValid($scope.options.selectedSizeField) ? $scope.options.selectedSizeField.columnName : "",
                    linkedNodeField: datasetService.isFieldValid($scope.options.selectedLinkedNodeField) ? $scope.options.selectedLinkedNodeField.columnName : "",
                    linkedNameField: datasetService.isFieldValid($scope.options.selectedLinkedNameField) ? $scope.options.selectedLinkedNameField.columnName : "",
                    linkedSizeField: datasetService.isFieldValid($scope.options.selectedLinkedSizeField) ? $scope.options.selectedLinkedSizeField.columnName : "",
                    dateField: datasetService.isFieldValid($scope.options.selectedDateField) ? $scope.options.selectedDateField.columnName : "",
                    flagField: datasetService.isFieldValid($scope.options.selectedFlagField) ? $scope.options.selectedFlagField.columnName : "",
                    flagMode: $scope.options.flagMode
                };
            };

            /**
             * Creates and returns the Neon query for the network graph.
             * @method createNetworkGraphQuery
             * @private
             * @return {Object}
             */
            var createNetworkGraphQuery = function() {
                var fields = [$scope.options.selectedNodeField.columnName];
                if(datasetService.isFieldValid($scope.options.selectedNameField)) {
                    fields.push($scope.options.selectedNameField.columnName);
                }
                if(datasetService.isFieldValid($scope.options.selectedSizeField)) {
                    fields.push($scope.options.selectedSizeField.columnName);
                }
                if(datasetService.isFieldValid($scope.options.selectedLinkedNodeField)) {
                    fields.push($scope.options.selectedLinkedNodeField.columnName);
                }
                if(datasetService.isFieldValid($scope.options.selectedLinkedNameField)) {
                    fields.push($scope.options.selectedLinkedNameField.columnName);
                }
                if(datasetService.isFieldValid($scope.options.selectedLinkedSizeField)) {
                    fields.push($scope.options.selectedLinkedSizeField.columnName);
                }
                if(datasetService.isFieldValid($scope.options.selectedFlagField)) {
                    fields.push($scope.options.selectedFlagField.columnName);
                }
                if(datasetService.isFieldValid($scope.options.selectedTextField)) {
                    fields.push($scope.options.selectedTextField.columnName);
                }

                var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name).withFields(fields).limit($scope.options.dataLimit);

                if(datasetService.isFieldValid($scope.options.selectedDateField)) {
                    query.sortBy($scope.options.selectedDateField.columnName, neon.query.ASCENDING);
                }

                if($scope.selectedNodeIds.length) {
                    var whereClauses = $scope.selectedNodeIds.map(function(nodeId) {
                        var whereClause = neon.query.where($scope.options.selectedNodeField.columnName, "=", nodeId);
                        if(datasetService.isFieldValid($scope.options.selectedLinkedNodeField)) {
                            return neon.query.or(whereClause, neon.query.where($scope.options.selectedLinkedNodeField.columnName, "=", nodeId));
                        }
                        return whereClause;
                    });
                    whereClauses = whereClauses.length > 1 ? neon.query.or.apply(neon.query, whereClauses) : whereClauses[0];
                    query.where(whereClauses);
                }

                return query;
            };

            /**
             * Deselected all selected nodes and the selected node network in the graph.
             * @method deselectAllNodesAndNetwork
             */
            $scope.deselectAllNodesAndNetwork = function() {
                if($scope.mediator) {
                    $scope.mediator.deselectAllNodesAndNetwork();
                    updateSelectedNodeIds();
                }
            };

            /**
             * Selects the node in the graph with the given ID and its network.
             * @param {Object} selectedNodeId
             * @method selectNodeAndNetworkFromNodeId
             */
            $scope.selectNodeAndNetworkFromNodeId = function(selectedNodeId) {
                if($scope.mediator) {
                    $scope.mediator.selectNodeAndNetworkFromNodeId(selectedNodeId);
                    updateSelectedNodeIds();
                }
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeDirectedGraphExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "directed-graph-export",
                    elementType: "button",
                    elementGroup: "graph_group",
                    source: "user",
                    tags: ["options", "directed-graph", "export"]
                });
                var query = createNetworkGraphQuery();
                query.limitClause = exportService.getLimitClause();
                query.ignoreFilters_ = exportService.getIgnoreFilters();
                query.ignoredFilterIds_ = exportService.getIgnoredFilterIds();
                // TODO Update due to recent graph changes.
                var fields = [];
                if(datasetService.isFieldValid($scope.options.selectedNodeField) && datasetService.isFieldValid($scope.options.selectedLinkedNodeField)) {
                    fields = [{
                        query: $scope.options.selectedNodeField.columnName,
                        pretty: $scope.options.selectedNodeField.prettyName
                    },{
                        query: $scope.options.selectedLinkedNodeField.columnName,
                        pretty: $scope.options.selectedLinkedNodeField.prettyName
                    }];
                    query.groupBy($scope.options.selectedNodeField, $scope.options.selectedLinkedNodeField);
                } else if(datasetService.isFieldValid($scope.options.selectedNodeField)) {
                    fields = [{
                        query: $scope.options.selectedNodeField.columnName,
                        pretty: $scope.options.selectedNodeField.prettyName
                    }];
                    query.groupBy($scope.options.selectedNodeField);
                } else if(datasetService.isFieldValid($scope.options.selectedLinkedNodeField)) {
                    fields = [{
                        query: $scope.options.selectedLinkedNodeField.columnName,
                        pretty: $scope.options.selectedLinkedNodeField.prettyName
                    }];
                    query.groupBy($scope.options.selectedLinkedNodeField);
                }

                var finalObject = {
                    name: "Directed Graph",
                    data: [{
                        query: query,
                        name: "directedGraph-" + $scope.exportID,
                        fields: fields,
                        ignoreFilters: query.ignoreFilters_,
                        selectionOnly: query.selectionOnly_,
                        ignoredFilterIds: query.ignoredFilterIds_,
                        type: "query"
                    }]
                };
                return finalObject;
            };

            /**
             * Creates and returns an object that contains all the binding fields needed to recreate the visualization's state.
             * @return {Object}
             * @method bindFields
             * @private
             */
            var bindFields = function() {
                var bindingFields = {};
                bindingFields["bind-feed-name"] = $scope.bindFeedName ? "'" + $scope.bindFeedName + "'" : undefined;
                bindingFields["bind-feed-type"] = $scope.bindFeedType ? "'" + $scope.bindFeedType + "'" : undefined;

                /* Set mappings for each field, if set */

                if($scope.options.selectedNodeField && $scope.options.selectedNodeField.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_NODE, $scope.options.selectedNodeField.columnName);
                }
                if($scope.options.selectedNameField && $scope.options.selectedNameField.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_NODE_NAME, $scope.options.selectedNameField.columnName);
                }
                if($scope.options.selectedSizeField && $scope.options.selectedSizeField.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_NODE_SIZE, $scope.options.selectedSizeField.columnName);
                }
                if($scope.options.selectedLinkedNodeField && $scope.options.selectedLinkedNodeField.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_LINKED_NODE, $scope.options.selectedLinkedNodeField.columnName);
                }
                if($scope.options.selectedLinkedNameField && $scope.options.selectedLinkedNameField.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_LINKED_NODE_NAME, $scope.options.selectedLinkedNameField.columnName);
                }
                if($scope.options.selectedLinkedSizeField && $scope.options.selectedLinkedSizeField.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_LINKED_NODE_SIZE, $scope.options.selectedLinkedSizeField.columnName);
                }
                if($scope.options.selectedFlagField && $scope.options.selectedFlagField.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_FLAG, $scope.options.selectedFlagField.columnName);
                }
                if($scope.options.selectedDateField && $scope.options.selectedDateField.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.DATE, $scope.options.selectedDateField.columnName);
                }
                if($scope.options.selectedTextField && $scope.options.selectedTextField.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.NEWSFEED_TEXT, $scope.options.selectedTextField.columnName);
                }

                if($scope.options.flagMode && $scope.options.flagMode.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_FLAG_MODE, $scope.options.flagMode.columnName);
                }
                if($scope.tooltip.idLabel && $scope.tooltip.idLabel.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_ID_LABEL, $scope.tooltip.idLabel.columnName);
                }
                if($scope.tooltip.dataLabel && $scope.tooltip.dataLabel.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_DATA_LABEL, $scope.tooltip.dataLabel.columnName);
                }
                if($scope.tooltip.nameLabel && $scope.tooltip.nameLabel.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_NAME_LABEL, $scope.tooltip.nameLabel.columnName);
                }
                if($scope.tooltip.sizeLabel && $scope.tooltip.sizeLabel.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_SIZE_LABEL, $scope.tooltip.sizeLabel.columnName);
                }
                if($scope.tooltip.flagLabel && $scope.tooltip.flagLabel.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_FLAG_LABEL, $scope.tooltip.flagLabel.columnName);
                }
                if($scope.tooltip.sourceNameLabel && $scope.tooltip.sourceNameLabel.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_SOURCE_NAME_LABEL, $scope.tooltip.sourceNameLabel.columnName);
                }
                if($scope.tooltip.targetNameLabel && $scope.tooltip.targetNameLabel.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_TARGET_NAME_LABEL, $scope.tooltip.targetNameLabel.columnName);
                }
                if($scope.tooltip.sourceSizeLabel && $scope.tooltip.sourceSizeLabel.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_SOURCE_SIZE_LABEL, $scope.tooltip.sourceSizeLabel.columnName);
                }
                if($scope.tooltip.targetSizeLabel && $scope.tooltip.targetSizeLabel.columnName) {
                    datasetService.setMapping($scope.options.database.name, $scope.options.table.name, neonMappings.GRAPH_TOOLTIP_TARGET_SIZE_LABEL, $scope.tooltip.targetSizeLabel.columnName);
                }

                return bindingFields;
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                initialize();
                displayActiveDataset(true);
            });
        }
    };
}]);
