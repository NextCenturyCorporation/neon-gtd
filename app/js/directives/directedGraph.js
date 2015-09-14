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

angular.module('neonDemo.directives')
.directive('directedGraph', ['$filter', '$timeout', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'ExportService',
function($filter, $timeout, connectionService, datasetService, errorNotificationService, exportService) {
    return {
        templateUrl: 'partials/directives/directedGraph.html',
        restrict: 'EA',
        scope: {
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            $element.addClass('directedGraphDirective');

            $scope.element = $element;

            $scope.optionsMenuButtonText = function() {
                if($scope.data.graphNodes.length === 0) {
                    return "No graph data available";
                }
                var text = $scope.numberOfVisibleNodes + " nodes";
                if($scope.bucketizer && $scope.selected.dateBucket) {
                    var date = $filter("date")($scope.bucketizer.getDateForBucket($scope.selected.dateBucket).toISOString(), $scope.bucketizer.getDateFormat());
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

            var NODE_TYPE = "node";
            var CLUSTER_TYPE = "cluster";

            var DEFAULT_NODE_GROUP = "default";
            var CLUSTER_NODE_GROUP = "cluster";
            var MISSING_NODE_GROUP = "missing";

            // Color codes copied from d3.scale.category10().
            var DEFAULT_COLOR = "#1f77b4"; // blue
            var CLUSTER_COLOR = "#9467bd"; // purple
            var MISSING_COLOR = "#d62728"; // red
            var FOCUSED_COLOR = "#2ca02c"; // green

            // Name for the arrowhead marker with the focused color.
            var FOCUSED_COLOR_ARROWHEAD = "focused";

            var DEFAULT_TOOLTIP_ID_LABEL = "";
            var DEFAULT_TOOLTIP_NAME_LABEL = "Name";
            var DEFAULT_TOOLTIP_SIZE_LABEL = "Size";
            var DEFAULT_TOOLTIP_SOURCE_LABEL = "From";
            var DEFAULT_TOOLTIP_TARGET_LABEL = "To";

            $scope.tooltip = {
                idLabel: DEFAULT_TOOLTIP_ID_LABEL,
                nameLabel: DEFAULT_TOOLTIP_NAME_LABEL,
                sizeLabel: DEFAULT_TOOLTIP_SIZE_LABEL,
                sourceNameLabel: DEFAULT_TOOLTIP_SOURCE_LABEL,
                targetNameLabel: DEFAULT_TOOLTIP_TARGET_LABEL,
                sourceSizeLabel: DEFAULT_TOOLTIP_SOURCE_LABEL,
                targetSizeLabel: DEFAULT_TOOLTIP_TARGET_LABEL
            };

            $scope.TIMEOUT_MS = 250;

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.numberOfVisibleNodes = 0;
            $scope.dataLimited = false;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.bucketizer = dateBucketizer();
            $scope.outstandingNodeQuery = undefined;
            $scope.outstandingGraphQuery = undefined;

            $scope.options = {
                database: {},
                table: {},
                selectedNodeField: {},
                selectedNameField: {},
                selectedLinkField: {},
                selectedLinkNameField: {},
                selectedDateField: {},
                selectedTextField: {},
                selectedNodeId: "",
                dataLimit: 500000,
                useNodeClusters: true,
                hideNodesWithZeroOrOneLink: false,
                reloadOnFilter: false
            };

            $scope.data = {
                availableNodeIds: [],
                graphNodes: [],
                graphLinks: [],
                nodeIdsToNetworkIds: {},
                networkIdsToNodeIds: {},
                dateBucketsToNodeIndices: {},
                dateBucketsToLinkIndices: {}
            };

            $scope.selected = {
                dateBucket: undefined,
                graphNodeIds: [],
                graphNetworkId: undefined,
                mouseoverNodeIds: undefined,
                mouseoverNetworkId: undefined
            };

            var calculateGraphHeight = function() {
                var headerHeight = 0;
                $element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                return $element.height() - headerHeight;
            };

            var calculateGraphWidth = function() {
                return $element.width();
            };

            var updateGraphSize = function() {
                // The D3 graph will resize itself but we need to trigger that resize event by changing the height and widget of the SVG.
                // Setting the dimensions on the SVG performs better than just setting the dimensions on the directed-graph-container.
                $element.find(".directed-graph .directed-graph-container svg").attr("height", calculateGraphHeight());
                $element.find(".directed-graph .directed-graph-container svg").attr("width", calculateGraphWidth());
                return $timeout(redraw, $scope.TIMEOUT_MS);
            };

            var updateSize = function() {
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

            /**
             * Selects the node in the graph with the given ID and its network.
             * @param {Object} selectedNodeId
             * @method selectNodeAndNetworkFromNodeId
             */
            $scope.selectNodeAndNetworkFromNodeId = function(selectedNodeId) {
                if(selectedNodeId !== "" && $scope.graph) {
                    var nodeId = Number(selectedNodeId) ? Number(selectedNodeId) : selectedNodeId;
                    var networkId = $scope.data.nodeIdsToNetworkIds[nodeId];

                    if(networkId !== undefined && $scope.selected.graphNodeIds.indexOf(nodeId) < 0) {
                        addSelectedNodeAndNetwork(nodeId, networkId);
                        redrawGraphAndShowSelectedNews();
                    }
                }
            };

            /**
             * Selects the node and network with the given IDs.  Deselects the node with the given ID if it is selected and deselectSelected is true.
             * @param {Number} or {String} nodeId
             * @param {Number} networkId
             * @param {Boolean} deselectSelected (optional)
             * @method addSelectedNodeAndNetwork
             * @private
             */
            var addSelectedNodeAndNetwork = function(nodeId, networkId, deselectSelected) {
                if($scope.selected.graphNetworkId !== networkId) {
                    $scope.graphNodeIds = [];
                }
                $scope.selected.graphNetworkId = networkId;

                var index = $scope.selected.graphNodeIds.indexOf(nodeId);
                if(index >= 0 && deselectSelected) {
                    $scope.selected.graphNodeIds.splice(index, 1);
                    if(!$scope.selected.graphNodeIds.length) {
                        $scope.selected.graphNetworkId = undefined;
                    }
                }

                if(index < 0) {
                    $scope.selected.graphNodeIds.push(nodeId);
                }
            };

            /**
             * Redraws the nodes and links in the graph to update the styling and publishes a news highlights event using the global selected nodes and network.
             * @method redrawGraphAndShowSelectedNews
             * @private
             */
            var redrawGraphAndShowSelectedNews = function() {
                $scope.graph.redrawNodesAndLinks();
                publishNewsHighlights();
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
                    initializeDateBuckets();
                });
                $scope.messenger.subscribe("date_selected", onDateSelected);

                $scope.exportID = exportService.register($scope.makeDirectedGraphExportObject);

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
                    $scope.messenger.removeEvents();
                    exportService.unregister($scope.exportID);
                });

                $element.resize(updateSize);
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
                } else if(whereClause.lhs === $scope.options.selectedNodeField.columnName && whereClause.lhs && whereClause.rhs) {
                    $scope.selectNodeAndNetworkFromNodeId(whereClause.rhs);
                } else if($scope.options.selectedLinkField && whereClause.lhs === $scope.options.selectedLinkField.columnName && whereClause.lhs && whereClause.rhs) {
                    $scope.selectNodeAndNetworkFromNodeId(whereClause.rhs);
                }
            };

            /**
             * Event handler for date selected events issued over Neon's messaging channels.
             * @param {Object} message A Neon date selected message.
             * @method onDateSelected
             * @private
             */
            var onDateSelected = function(message) {
                if(!message.start && !$scope.selected.dateBucket) {
                    return;
                }

                if($scope.bucketizer.getStartDate() && $scope.bucketizer.getEndDate()) {
                    var bucket = undefined;
                    var nodes = $scope.data.graphNodes;
                    var links = $scope.data.graphLinks;

                    if(message.start) {
                        bucket = $scope.bucketizer.getBucketIndex(message.start);
                        if(bucket === $scope.selected.dateBucket) {
                            return;
                        }

                        nodes = $scope.data.graphNodes.slice(0, $scope.data.dateBucketsToNodeIndices[bucket]);
                        nodes.forEach(function(node) {
                            if(node.dateBucketsToNodeIndices && node.nodes) {
                                node.nodesForSelectedDateBucket = node.nodes.slice(0, node.dateBucketsToNodeIndices[bucket]);
                            }
                        });

                        links = $scope.data.graphLinks.slice(0, $scope.data.dateBucketsToLinkIndices[bucket]);
                    }

                    $scope.selected.dateBucket = bucket;
                    $scope.numberOfVisibleNodes = nodes.length;

                    $scope.graph.updateGraph({
                        nodes: nodes,
                        links: links
                    });

                    if($scope.selected.dateBucket) {
                        // Pulse all nodes that occur (contain a date) in the selected date bucket.
                        $scope.graph.pulseNodes(function(node) {
                            return _.find(node.dates, function(date) {
                                return $scope.bucketizer.getBucketIndex(date) === $scope.selected.dateBucket;
                            });
                        });
                    }
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

                if(!$scope.graph) {
                    $scope.graph = new charts.DirectedGraph($element[0], ".directed-graph-container", {
                        getHeight: calculateGraphHeight,
                        getWidth: calculateGraphWidth,
                        getNodeSize: calculateNodeSize,
                        getNodeColor: calculateNodeColor,
                        getNodeOpacity: calculateNodeOpacity,
                        getNodeText: createNodeText,
                        getNodeTooltip: createNodeTooltip,
                        getLinkSize: calculateLinkSize,
                        getLinkColor: calculateLinkColor,
                        getLinkOpacity: calculateLinkOpacity,
                        getLinkArrowhead: getLinkArrowhead,
                        getLinkTooltip: createLinkTooltip,
                        getNodeKey: getNodeKey,
                        getLinkKey: getLinkKey,
                        nodeMouseoverHandler: onNodeSelect,
                        nodeMouseoutHandler: onNodeDeselect,
                        nodeClickHandler: onNodeClick,
                        linkMouseoverHandler: onLinkSelect,
                        linkMouseoutHandler: onLinkDeselect,
                        linkClickHandler: onLinkClick
                    });
                    $scope.graph.createArrowhead(FOCUSED_COLOR_ARROWHEAD, FOCUSED_COLOR, $scope.graph.DEFAULT_LINK_STROKE_OPACITY);
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
                $scope.options.table = datasetService.getFirstTableWithMappings($scope.options.database.name, ["graph_nodes"]) || $scope.tables[0];
                $scope.updateFields();
            };

            /**
             * Updates the fields available in this visualization using the selected database/table and the active dataset.
             * @method updateFields
             */
            $scope.updateFields = function() {
                $scope.loadingData = true;
                $scope.fields = datasetService.getSortedFields($scope.options.database.name, $scope.options.table.name);

                var selectedNodeField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "graph_nodes") || "";
                $scope.options.selectedNodeField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedNodeField;
                }) || {
                    columnName: "",
                    prettyName: ""
                };
                var selectedNameField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "graph_nodes_names") ||
                    datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "newsfeed_name") || "";
                $scope.options.selectedNameField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedNameField;
                }) || {
                    columnName: "",
                    prettyName: ""
                };
                var selectedLinkField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "graph_links") || "";
                $scope.options.selectedLinkField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedLinkField;
                }) || {
                    columnName: "",
                    prettyName: ""
                };
                var selectedLinkNameField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "graph_links_names") || "";
                $scope.options.selectedLinkNameField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedLinkNameField;
                }) || {
                    columnName: "",
                    prettyName: ""
                };
                var selectedDateField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "date") || "";
                $scope.options.selectedDateField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedDateField;
                }) || {
                    columnName: "",
                    prettyName: ""
                };
                var selectedTextField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "newsfeed_text") || "";
                $scope.options.selectedTextField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedTextField;
                }) || {
                    columnName: "",
                    prettyName: ""
                };

                $scope.tooltip = {
                    idLabel: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "graph_tooltip_id_label") || DEFAULT_TOOLTIP_ID_LABEL,
                    nameLabel: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "graph_tooltip_name_label") || DEFAULT_TOOLTIP_NAME_LABEL,
                    sizeLabel: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "graph_tooltip_size_label") || DEFAULT_TOOLTIP_SIZE_LABEL,
                    sourceNameLabel: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "graph_tooltip_source_name_label") || DEFAULT_TOOLTIP_SOURCE_LABEL,
                    targetNameLabel: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "graph_tooltip_target_name_label") || DEFAULT_TOOLTIP_TARGET_LABEL,
                    sourceSizeLabel: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "graph_tooltip_source_size_label") || DEFAULT_TOOLTIP_SOURCE_LABEL,
                    targetSizeLabel: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "graph_tooltip_target_size_label") || DEFAULT_TOOLTIP_TARGET_LABEL
                };

                $scope.selected.graphNodeIds = [];
                $scope.queryForData();
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

                $scope.selected.mouseoverNodeIds = [];
                $scope.selected.mouseoverNetworkId = undefined;
                $scope.selected.graphNetworkId = undefined
                $scope.data.availableNodeIds = [];

                publishNews([]);
                publishNewsHighlights([]);

                if($scope.data.graphNodes.length) {
                    saveDataAndUpdateGraph([], []);
                }

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.options.selectedNodeField.columnName) {
                    $scope.loadingData = false;
                    return;
                }

                if(reloadNetworkGraph || $scope.selected.graphNodeIds.length) {
                    queryForNetworkGraph(connection);
                }

                if(reloadNodeList) {
                    queryForNodeList(connection);
                }
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
                        head: item[$scope.options.selectedNodeField.columnName]
                    };
                    if($scope.options.selectedDateField && $scope.options.selectedDateField.columnName) {
                        newsItem.date = new Date(item[$scope.options.selectedDateField.columnName]);
                    }
                    if($scope.options.selectedNameField && $scope.options.selectedNameField.columnName) {
                        newsItem.name = item[$scope.options.selectedNameField.columnName];
                    }
                    if($scope.options.selectedTextField && $scope.options.selectedTextField.columnName) {
                        newsItem.text = item[$scope.options.selectedTextField.columnName];
                        // Delete the text from the data to improve our memory preformance because we don't need it any longer.
                        delete item[$scope.options.selectedTextField.columnName];
                    }
                    news.push(newsItem);
                });

                $scope.messenger.publish("news", {
                    news: news,
                    type: datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "newsfeed_type") || ""
                });
            };

            /**
             * Publishes a news highlights event using the global selected nodes and network.
             * @method publishNewsHighlights
             * @private
             */
            var publishNewsHighlights = function() {
                $scope.messenger.publish("news_highlights", {
                    show: {
                        heads: $scope.data.networkIdsToNodeIds[$scope.selected.graphNetworkId]
                    },
                    highlights: {
                        heads: $scope.selected.graphNodeIds
                    }
                });
            };

            /**
             * Query for the list of nodes using the selected field but do not draw a graph.
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
                        if($scope.data.availableNodeIds.indexOf(nodeId) < 0) {
                            $scope.data.availableNodeIds.push(nodeId);
                        }
                    }

                    // Sort the nodes so they are displayed in alphabetical order in the options dropdown.
                    $scope.data.availableNodeIds.sort(function(a, b) {
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

            var createNodeListQuery = function() {
                var query = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name)
                    .withFields([$scope.options.selectedNodeField.columnName])
                    .groupBy($scope.options.selectedNodeField.columnName)
                    .aggregate(neon.query.COUNT, '*', 'count');

                return query;
            };

            /**
             * Query for the list of nodes that link to the filtered nodes and draw the graph containing the network.
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
                        createAndShowGraph(response.data);
                    }
                    $scope.queryForSelectedNetworkGraph = false;
                    $scope.loadingData = false;
                });
                $scope.outstandingGraphQuery.fail(function(response) {
                    if(response.status !== 0) {
                        $scope.$apply(function() {
                            saveDataAndUpdateGraph([], []);
                        });
                        $scope.queryForSelectedNetworkGraph = false;
                        $scope.loadingData = false;
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
                    }
                });
            };

            var createNetworkGraphQuery = function() {
                var fields = [$scope.options.selectedNodeField.columnName];
                if($scope.options.selectedLinkField && $scope.options.selectedLinkField.columnName) {
                    fields.push($scope.options.selectedLinkField.columnName);
                }
                if($scope.options.selectedNameField && $scope.options.selectedNameField.columnName) {
                    fields.push($scope.options.selectedNameField.columnName);
                }
                if($scope.options.selectedLinkNameField && $scope.options.selectedLinkNameField.columnName) {
                    fields.push($scope.options.selectedLinkNameField.columnName);
                }
                if($scope.options.selectedTextField && $scope.options.selectedTextField.columnName) {
                    fields.push($scope.options.selectedTextField.columnName);
                }

                var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name).withFields(fields).limit($scope.options.dataLimit);

                if($scope.options.selectedDateField && $scope.options.selectedDateField.columnName) {
                    query.sortBy($scope.options.selectedDateField.columnName, neon.query.ASCENDING);
                }

                if($scope.selected.graphNodeIds.length) {
                    var whereClauses = $scope.selected.graphNodeIds.map(function(nodeId) {
                        var whereClause = neon.query.where($scope.options.selectedNodeField.columnName, "=", nodeId);
                        if($scope.options.selectedLinkField && $scope.options.selectedLinkField.columnName) {
                            return neon.query.or(whereClause, neon.query.where($scope.options.selectedLinkField.columnName, "=", nodeId));
                        }
                        return whereClause;
                    });
                    if(whereClauses.length > 1) {
                        whereClauses = neon.query.or.apply(neon.query, whereClauses);
                    }
                    query.where(whereClauses);
                    $scope.queryForSelectedNetworkGraph = true;
                }

                return query;
            };

            /**
             * Creates and shows this visualization's graph using the given data from a query.
             * @param {Array} data
             * @method createAndShowGraph
             * @private
             */
            var createAndShowGraph = function(data) {
                publishNews(data);

                $scope.dataLimited = (data.length >= $scope.options.dataLimit);

                // Maps source node IDs to an array of target node IDs to ensure each link we add to the graph is unique and help with clustering.
                var sourcesToTargets = {};
                // Maps target node IDs to an array of source node IDs to ensure each link we add to the graph is unique and help with clustering.
                var targetsToSources = {};
                // The nodes to be added to the graph.
                var nodes = [];
                // The links to be added to the graph.
                var links = [];
                // The IDs of the nodes that exist in the node field of the data.
                var nodeIds = {};
                // Maps source node IDs to target node IDs to an array of dates for each instance of a link between the source and target nodes.
                var sourcesToTargetsToLinkDates = {};

                /**
                 * Adds a node for the given ID, name, and date to the list of nodes if it does not already exist and returns the node.
                 * @param {Number} or {String} id
                 * @param {Number} or {String} name
                 * @method addNodeIfUnique
                 * @private
                 * @return {Object}
                 */
                var addNodeIfUnique = function(id, name) {
                    var node = _.find(nodes, function(node) {
                        return node.id === id;
                    });

                    if(!node) {
                        node = createNode(id, name, NODE_TYPE, MISSING_NODE_GROUP);
                        nodes.push(node);
                    }

                    return node;
                };

                /**
                 * Adds a link for the given source and target to the list of links if it does not already exist.
                 * @param {Number} or {String} sourceId
                 * @param {Number} or {String} targetId
                 * @param {Date} date
                 * @method addLinkIfUnique
                 * @private
                 */
                var addLinkIfUnique = function(sourceId, targetId, date) {
                    if(!targetsToSources[targetId]) {
                        targetsToSources[targetId] = [];
                    }

                    if(targetsToSources[targetId].indexOf(sourceId) < 0) {
                        targetsToSources[targetId].push(sourceId);
                    }

                    if(!sourcesToTargets[sourceId]) {
                        sourcesToTargets[sourceId] = [];
                    }

                    if(sourcesToTargets[sourceId].indexOf(targetId) < 0) {
                        sourcesToTargets[sourceId].push(targetId);
                        var link = createLink(sourceId, NODE_TYPE, targetId, NODE_TYPE);
                        links.push(link);
                        if(!sourcesToTargetsToLinkDates[sourceId]) {
                            sourcesToTargetsToLinkDates[sourceId] = {};
                        }
                        if(!sourcesToTargetsToLinkDates[sourceId][targetId]) {
                            sourcesToTargetsToLinkDates[sourceId][targetId] = [];
                        }
                    }

                    sourcesToTargetsToLinkDates[sourceId][targetId].push(date);
                };

                // Add each unique node from the data to the graph as a node.
                data.forEach(function(item) {
                    var nodeId = item[$scope.options.selectedNodeField.columnName];
                    var nodeName = ($scope.options.selectedNameField && $scope.options.selectedNameField.columnName) ? item[$scope.options.selectedNameField.columnName] : nodeId;
                    var itemDate = ($scope.options.selectedDateField && $scope.options.selectedDateField.columnName) ? new Date(item[$scope.options.selectedDateField.columnName]) : undefined;

                    if(nodeId) {
                        var node = addNodeIfUnique(nodeId, nodeName);
                        node.dates.push(itemDate);
                        // Nodes that exist in the data are put in the default group.  Nodes that exist only as linked nodes are put in the missing group.
                        node.group = (node.group === MISSING_NODE_GROUP ? DEFAULT_NODE_GROUP : node.group);
                        nodeIds[node.id] = true;

                        if($scope.options.selectedLinkField && $scope.options.selectedLinkField.columnName) {
                            var linkedNodeIds = item[$scope.options.selectedLinkField.columnName] || [];
                            linkedNodeIds = (linkedNodeIds.constructor === Array) ? linkedNodeIds : [linkedNodeIds];

                            var linkedNodeNames = [];
                            if($scope.options.selectedLinkNameField && $scope.options.selectedLinkNameField.columnName) {
                                linkedNodeNames = item[$scope.options.selectedLinkNameField.columnName] || [];
                                linkedNodeNames = (linkedNodeNames.constructor === Array) ? linkedNodeNames : [linkedNodeNames];
                            }

                            // Add each related node to the graph as a node with a link to the original node.
                            linkedNodeIds.forEach(function(linkedNodeId, index) {
                                if(linkedNodeId && linkedNodeId !== nodeId) {
                                    // Linked nodes have no date because each date is an instance of the node in the data.  Future instances of the linked node in the data will add
                                    // their dates to the linked node's date array.  If the linked node is not in the data, the user will see its type and empty date array.
                                    var linkedNode = addNodeIfUnique(linkedNodeId, linkedNodeNames[index]);
                                    // If we're loading the graph to show a selected network of nodes, set the group of unknown linked nodes to the default group unless the linked nodes are selected.
                                    if($scope.queryForSelectedNetworkGraph && $scope.selected.graphNodeIds.indexOf(linkedNodeId) < 0) {
                                        linkedNode.group = DEFAULT_NODE_GROUP;
                                    }
                                    addLinkIfUnique(linkedNodeId, nodeId, itemDate);
                                }
                            });
                        }
                    }
                });

                $scope.data.nodeIdsToNetworkIds = {};
                $scope.data.networkIdsToNodeIds = {};

                var result = clusterAndHideNodes(nodes, links, sourcesToTargets, targetsToSources, nodeIds);
                nodes = result.nodes;
                links = result.links;

                $scope.$apply(function() {
                    saveDataAndUpdateGraph(nodes, links, sourcesToTargetsToLinkDates);
                });
            };

            /**
             * Creates and returns a new node for the graph.
             * @param {Number} or {String} id
             * @param {Number} or {String} name
             * @param {Number} or {String} type
             * @param {Number} or {String} group
             * @param {Array} dates (optional)
             * @method createNode
             * @private
             * @return {Object}
             */
            var createNode = function(id, name, type, group, dates) {
                return {
                    id: id,
                    dates: dates ? dates : [],
                    group: group,
                    name: name || "",
                    network: 0,
                    type: type,
                    key: createNodeKey(id, type)
                };
            };

            /**
             * Creates and returns a unique node key using the given node ID and type.
             * @param {Number} or {String} id
             * @param {Number} or {String} type
             * @method createNodeKey
             * @private
             * @return {String}
             */
            var createNodeKey = function(id, type) {
                return type + "." + id;
            };

            /**
             * Creates and returns a new link connecting two nodes with the given IDs.
             * @param {Number} or {String} sourceId
             * @param {Number} or {String} sourceType
             * @param {Number} or {String} targetId
             * @param {Number} or {String} targetType
             * @method createLink
             * @private
             * @return {Object}
             */
            var createLink = function(sourceId, sourceType, targetId, targetType) {
                return {
                    sourceId: sourceId,
                    targetId: targetId,
                    sourceType: sourceType,
                    targetType: targetType
                };
            };

            /**
             * Creates and returns a unique link key using the given node IDs and types.
             * @param {Number} or {String} sourceId
             * @param {Number} or {String} targetId
             * @param {Number} or {String} sourceType
             * @param {Number} or {String} targetType
             * @method createLinkKey
             * @private
             * @return {String}
             */
            var createLinkKey = function(sourceId, sourceType, targetId, targetType) {
                return createNodeKey(sourceId, sourceType) + "-" + createNodeKey(targetId, targetType);
            };

            /**
             * Creates clusters for nodes in the given array as appropriate and returns an object containing the new arrays of nodes and links.
             * @param {Array} nodes
             * @param {Array} links
             * @param {Object} sourcesToTargets
             * @param {Object} targetsToSources
             * @param {Object} nodeIds
             * @method clusterAndHideNodes
             * @private
             * @return {Object}
             */
            var clusterAndHideNodes = function(nodes, links, sourcesToTargets, targetsToSources, nodeIds) {
                // The node and link lists that will be returned.
                var resultNodes = [];
                var resultLinks = links;

                var nextFreeClusterId = 1;
                var sourcesToClusterTargets = {};
                var targetsToClusterSources = {};

                // The cluster for all nodes that are not linked to any other nodes.
                var unlinkedCluster = createNode(0, null, CLUSTER_TYPE, CLUSTER_NODE_GROUP);
                unlinkedCluster.nodes = [];
                $scope.data.networkIdsToNodeIds[0] = [];

                /**
                 * Adds a new cluster node to the list of nodes using the given node IDs or adds a node to an existing cluster node.  Returns the ID of the cluster node.
                 * Either sourceId or targetId should be undefined (but not both).
                 * @param {Number} clusterId The ID of the cluster node, or undefined if a new cluster node should be created.
                 * @param {Number} or {String} sourceId The ID of the source node linked to the cluster node, or undefined if the cluster node is the source.
                 * @param {Number} or {String} targetId the ID of the target node linked to the cluster node, or undefined if the cluster node is the target.
                 * @param {Object} nodeToCluster The node to add to the cluster.
                 * @method addCluster
                 * @private
                 * @return {Number}
                 */
                var addCluster = function(clusterId, sourceId, targetId, nodeToCluster) {
                    if(!clusterId) {
                        clusterId = nextFreeClusterId++;
                        // Create a new cluster node and add it to the list of nodes.
                        var cluster = createNode(clusterId, null, CLUSTER_TYPE, CLUSTER_NODE_GROUP, nodeToCluster.dates);
                        cluster.nodes = [nodeToCluster];
                        resultNodes.push(cluster);
                    } else {
                        // Add the node to the existing cluster.
                        var cluster = _.find(resultNodes, function(node) {
                            return node.type === CLUSTER_TYPE && node.id === clusterId;
                        });
                        cluster.nodes.push(nodeToCluster);
                        cluster.dates = cluster.dates.concat(nodeToCluster.dates);
                        sortDates(cluster);
                    }

                    // If one doesn't exist, create a new link between the cluster node and the other node.  Use the cluster node ID as the source/target ID for the link.
                    if(!((sourceId && sourcesToClusterTargets[sourceId]) || (targetId && targetsToClusterSources[targetId]))) {
                        var link = createLink((sourceId || clusterId), (sourceId ? NODE_TYPE : CLUSTER_TYPE), (targetId || clusterId), (targetId ? NODE_TYPE : CLUSTER_TYPE));
                        resultLinks.push(link);
                    }
                    return clusterId;
                };

                nodes.forEach(function(node) {
                    sortDates(node);
                    node.numberOfTargets = sourcesToTargets[node.id] ? sourcesToTargets[node.id].length : 0;
                    node.numberOfSources = targetsToSources[node.id] ? targetsToSources[node.id].length : 0;

                    // If the node is a missing type or has more than one link, keep it; otherwise, add it to a cluster.
                    if(node.group === MISSING_NODE_GROUP || node.numberOfTargets > 1 || node.numberOfSources > 1 || (node.numberOfTargets === 1 && node.numberOfSources === 1)) {
                        resultNodes.push(node);
                    } else if(node.numberOfTargets === 1) {
                        var targetId = sourcesToTargets[node.id][0];
                        if(shouldCluster(targetId, targetsToSources, sourcesToTargets)) {
                            targetsToClusterSources[targetId] = addCluster(targetsToClusterSources[targetId], null, targetId, node);
                        } else if(!($scope.options.hideNodesWithZeroOrOneLink && targetsToSources[targetId].length === 1 && nodeIds[targetId])) {
                            resultNodes.push(node);
                        }
                    } else if(node.numberOfSources === 1) {
                        var sourceId = targetsToSources[node.id][0];
                        if(shouldCluster(sourceId, sourcesToTargets, targetsToSources)) {
                            sourcesToClusterTargets[sourceId] = addCluster(sourcesToClusterTargets[sourceId], sourceId, null, node);
                        } else if(!($scope.options.hideNodesWithZeroOrOneLink && sourcesToTargets[sourceId].length === 1 && nodeIds[sourceId])) {
                            resultNodes.push(node);
                        }
                    } else if(!$scope.options.hideNodesWithZeroOrOneLink) {
                        if($scope.options.useNodeClusters) {
                            // If the node has no links, add it to the cluster node for unlinked nodes.
                            unlinkedCluster.nodes.push(node);
                            unlinkedCluster.dates = unlinkedCluster.dates.concat(node.dates);
                        } else {
                            resultNodes.push(node);
                        }
                        $scope.data.nodeIdsToNetworkIds[node.id] = 0;
                        $scope.data.networkIdsToNodeIds[0].push(node.id);
                    }
                });

                if(unlinkedCluster.nodes.length) {
                    sortDates(unlinkedCluster);
                    resultNodes.push(unlinkedCluster);
                }

                return {
                    nodes: resultNodes,
                    links: resultLinks
                };
            };

            /**
             * Sorts the array of dates in the given object.
             * @param {Object} object
             * @method sortDates
             * @private
             */
            var sortDates = function(object) {
                object.dates.sort(function(a, b) {
                    return a.getTime() - b.getTime();
                });
            };

            /**
             * Returns whether to cluster the node linked to the node with the given ID based on whether the cluster to be created would contain more than one node.
             * @param {Number} or {String} id The ID of the node linked to the node in question.
             * @param {Object} map The mapping from the given ID to the node in question.
             * @param {Object} reverseMap The reverse mapping.
             * @method shouldCluster
             * @private
             * @return {Boolean}
             */
            var shouldCluster = function(id, map, reverseMap) {
                // Check if the linked node itself has other linked nodes.  If not, the node in question should not be clustered.
                if($scope.options.useNodeClusters && map[id] && map[id].length > 1) {
                    // Check if the cluster would contain more than one node.  If not, the node in question should not be clustered.
                    return map[id].filter(function(otherId) {
                        return reverseMap[otherId].length === 1;
                    }).length > 1;
                }
                return false;
            };

            /**
             * Sets the network IDs for the given nodes.  Creates and returns the array of links containing indices for the source and target nodes using the
             * given list of nodes and links containing source and target node IDs.
             * @param {Array} nodes
             * @param {Array} links
             * @param {Object} sourcesToTargetsToLinkDates
             * @method finalizeNetworksAndCreateLinks
             * @private
             * @return {Array}
             */
            var finalizeNetworksAndCreateLinks = function(nodes, links, sourcesToTargetsToLinkDates) {
                // While the input links connect source node IDs to target node IDs, D3 links must connect source node index to target node index.
                var indexLinks = [];

                var nextFreeNetworkId = 1;

                links.forEach(function(link) {
                    var sourceIndex = _.findIndex(nodes, function(node) {
                        return node.id === link.sourceId && node.type === link.sourceType;
                    });
                    var targetIndex = _.findIndex(nodes, function(node) {
                        return node.id === link.targetId && node.type === link.targetType;
                    });

                    if(sourceIndex >= 0 && targetIndex >= 0) {
                        var sourceNode = nodes[sourceIndex];
                        var targetNode = nodes[targetIndex];
                        if(!sourceNode.network && !targetNode.network) {
                            var networkId = nextFreeNetworkId++;
                            setNodeNetworkId(sourceNode, networkId);
                            setNodeNetworkId(targetNode, networkId);
                        } else if(!sourceNode.network) {
                            setNodeNetworkId(sourceNode, targetNode.network);
                        } else if(!targetNode.network) {
                            setNodeNetworkId(targetNode, sourceNode.network);
                        } else if(sourceNode.network !== targetNode.network) {
                            var oldNetworkId = targetNode.network;
                            nodes.forEach(function(node) {
                                if(node.network === oldNetworkId) {
                                    setNodeNetworkId(node, sourceNode.network);
                                }
                            });
                            indexLinks.forEach(function(indexLink) {
                                if(indexLink.network === oldNetworkId) {
                                    indexLink.network = sourceNode.network;
                                }
                            });
                        }

                        // If we're loading the graph to show a selected network of nodes, set the selected network ID to the node's network ID.
                        if($scope.queryForSelectedNetworkGraph) {
                            $scope.selected.graphNetworkId = sourceNode.network;
                        }

                        saveNodeIdAndNetworkIdMappings(sourceNode);
                        saveNodeIdAndNetworkIdMappings(targetNode);

                        var dates = [];
                        if(sourceNode.type !== CLUSTER_TYPE && targetNode.type !== CLUSTER_TYPE) {
                            dates = sourcesToTargetsToLinkDates[sourceNode.id][targetNode.id];
                        }
                        if(sourceNode.type === CLUSTER_TYPE) {
                            sourceNode.nodes.forEach(function(nodeInCluster) {
                                dates = dates.concat(sourcesToTargetsToLinkDates[nodeInCluster.id][targetNode.id]);
                            });
                        }
                        if(targetNode.type === CLUSTER_TYPE) {
                            targetNode.nodes.forEach(function(nodeInCluster) {
                                dates = dates.concat(sourcesToTargetsToLinkDates[sourceNode.id][nodeInCluster.id]);
                            });
                        }

                        indexLinks.push({
                            source: sourceIndex,
                            target: targetIndex,
                            dates: dates,
                            network: sourceNode.network,
                            key: createLinkKey(link.sourceId, link.sourceType, link.targetId, link.targetType)
                        });
                    }
                });

                return indexLinks;
            };

            /**
             * Sets the network ID for the given node.  If the node is a cluster, also sets the network ID for all nodes in the cluster.
             * @param {Object} node
             * @param {Number} networkId
             * @method setNodeNetworkId
             * @private
             */
            var setNodeNetworkId = function(node, networkId) {
                node.network = networkId;
                if(node.type === CLUSTER_TYPE) {
                    node.nodes.forEach(function(nodeInCluster) {
                        setNodeNetworkId(nodeInCluster, networkId);
                    });
                }
            };

            /**
             * Saves the node ID to network ID and network ID to node ID mappings of the given node in the global map.  If the node is a cluster, also saves the mappings for all nodes in the cluster.
             * @param {Object} node
             * @method saveNodeIdAndNetworkIdMappings
             * @private
             */
            var saveNodeIdAndNetworkIdMappings = function(node) {
                if(node.type === CLUSTER_TYPE) {
                    node.nodes.forEach(function(nodeInCluster) {
                        saveNodeIdAndNetworkIdMappings(nodeInCluster);
                    });
                } else {
                    $scope.data.nodeIdsToNetworkIds[node.id] = node.network;
                    if(!$scope.data.networkIdsToNodeIds[node.network]) {
                        $scope.data.networkIdsToNodeIds[node.network] = [];
                    }
                    $scope.data.networkIdsToNodeIds[node.network].push(node.id);
                }
            };

            /**
             * Saves the given nodes and links and updates this visualization's network graph using the data.
             * @param {Array} nodes
             * @param {Array} links
             * @param {Object} sourcesToTargetsToLinkDates
             * @method saveDataAndUpdateGraph
             * @private
             */
            var saveDataAndUpdateGraph = function(nodes, links, sourcesToTargetsToLinkDates) {
                $scope.data.graphNodes = nodes;
                sortNodesOrLinks($scope.data.graphNodes);

                // Sets the node/link network IDs and transforms links connecting node IDs to links connecting node indices.
                $scope.data.graphLinks = finalizeNetworksAndCreateLinks($scope.data.graphNodes, links, sourcesToTargetsToLinkDates);
                sortNodesOrLinks($scope.data.graphLinks);

                $scope.numberOfVisibleNodes = $scope.data.graphNodes.length;

                initializeDateBuckets();

                $scope.graph.updateGraph({
                    nodes: $scope.data.graphNodes,
                    links: $scope.data.graphLinks
                });
            };

            /**
             * Sorts the given list of nodes or links by their earliest date.  Assumes the list of dates for each item is sorted.  Items with no dates will be sorted first.
             * @param nodes
             * @method sortNodesOrLinks
             * @private
             */
            var sortNodesOrLinks = function(list) {
                list.sort(function(a, b) {
                    if(!a.dates.length) {
                        return -1;
                    }
                    if(!b.dates.length) {
                        return 1;
                    }
                    return a.dates[0].getTime() - b.dates[0].getTime();
                });
            };

            /**
             * Initializes the global date bucket maps for the global node and link data using the global bucketizer.
             * @method initializeDateBuckets
             * @private
             */
            var initializeDateBuckets = function() {
                var i;
                var numberOfBuckets = $scope.bucketizer.getNumBuckets();
                $scope.data.dateBucketsToNodeIndices = createDateBucketMap();
                $scope.data.dateBucketsToLinkIndices = createDateBucketMap();

                if($scope.bucketizer && $scope.bucketizer.getStartDate() && $scope.bucketizer.getEndDate()) {
                    $scope.data.graphNodes.forEach(function(node, index) {
                        var bucket = node.dates[0] ? $scope.bucketizer.getBucketIndex(node.dates[0]) : 0;
                        for(i = bucket; i < numberOfBuckets; ++i) {
                            $scope.data.dateBucketsToNodeIndices[i] = index + 1;
                        }

                        // If the node is a cluster containing its own nodes, create a date bucket map for the cluster.
                        if(node.type === CLUSTER_TYPE) {
                            node.dateBucketsToNodeIndices = createDateBucketMap();
                            node.nodes.forEach(function(nodeInCluster, indexInCluster) {
                                var bucketInCluster = nodeInCluster.dates[0] ? $scope.bucketizer.getBucketIndex(nodeInCluster.dates[0]) : 0;
                                for(i = bucketInCluster; i < numberOfBuckets; ++i) {
                                    node.dateBucketsToNodeIndices[i] = indexInCluster + 1;
                                }
                            });
                            node.nodesForSelectedDateBucket = node.nodes;
                        }
                    });

                    $scope.data.graphLinks.forEach(function(link, index) {
                        var bucket = link.dates[0] ? $scope.bucketizer.getBucketIndex(link.dates[0]) : 0;
                        for(i = bucket; i < numberOfBuckets; ++i) {
                            $scope.data.dateBucketsToLinkIndices[i] = index + 1;
                        }
                    });
                }
            };

            /**
             * Creates and returns a map containing keys for each date bucket in the global bucketizer.
             * @method createDateBucketMap
             * @private
             * @return {Object}
             */
            var createDateBucketMap = function() {
                var dateBucketMap = {};

                if($scope.bucketizer && $scope.bucketizer.getStartDate() && $scope.bucketizer.getEndDate()) {
                    var numberOfBuckets = $scope.bucketizer.getNumBuckets();
                    for(var i = 0; i < numberOfBuckets; ++i) {
                        dateBucketMap[i] = 0;
                    }
                }

                return dateBucketMap;
            };

            /**
             * Returns the size for the given node.
             * @param {Object} node
             * @method calculateNodeSize
             * @private
             * @return {Number}
             */
            var calculateNodeSize = function(node) {
                var size = 0;
                if(node.type === CLUSTER_TYPE) {
                    var nodesInCluster = $scope.selected.dateBucket ? node.nodesForSelectedDateBucket : node.nodes;
                    nodesInCluster.forEach(function(nodeInCluster) {
                        size += getDatesInNodeOrLink(nodeInCluster).length;
                    });
                } else {
                    size = getDatesInNodeOrLink(node).length;
                }
                return 10 + Math.min(20, Math.floor(size / 5));
            };

            /**
             * Returns the array of dates in the given node or link object before or in the global selected date bucket (or all the dates if the date bucket is undefined).
             * @param {Object} object
             * @method getDatesInNodeOrLink
             * @private
             * @return {Array}
             */
            var getDatesInNodeOrLink = function(object) {
                if($scope.bucketizer && $scope.selected.dateBucket) {
                    var index = _.findIndex(object.dates, function(date, index) {
                        return $scope.bucketizer.getBucketIndex(date) > $scope.selected.dateBucket;
                    }) || object.dates.length;
                    return object.dates.slice(0, index);
                }
                return object.dates;
            };

            /**
             * Returns the color for the given node.
             * @param {Object} node
             * @method calculateNodeColor
             * @private
             * @return {String}
             */
            var calculateNodeColor = function(node) {
                if(node.type !== CLUSTER_TYPE && ($scope.selected.mouseoverNodeIds.indexOf(node.id) >= 0 || $scope.selected.graphNodeIds.indexOf(node.id) >= 0)) {
                    return FOCUSED_COLOR;
                }
                if(node.type === CLUSTER_TYPE) {
                    var nodesInCluster = $scope.selected.dateBucket ? node.nodesForSelectedDateBucket : node.nodes;
                    if($scope.selected.mouseoverNodeIds.indexOf(nodesInCluster[0].id) >= 0 || $scope.selected.graphNodeIds.indexOf(nodesInCluster[0].id) >= 0) {
                        return FOCUSED_COLOR;
                    }
                }
                if(node.group === CLUSTER_NODE_GROUP) {
                    return CLUSTER_COLOR;
                }
                if(node.group === MISSING_NODE_GROUP) {
                    return MISSING_COLOR;
                }
                return DEFAULT_COLOR;
            };

            /**
             * Returns the opacity for the given node.
             * @param {Object} node
             * @method calculateNodeOpacity
             * @private
             * @return {Number}
             */
            var calculateNodeOpacity = function(node) {
                if($scope.selected.mouseoverNetworkId === node.network || $scope.selected.graphNetworkId === node.network) {
                    return $scope.graph.DEFAULT_NODE_OPACITY;
                } else if($scope.selected.mouseoverNetworkId || $scope.selected.graphNetworkId) {
                    return $scope.graph.DEFAULT_NODE_OPACITY / 2.0;
                }
                return $scope.graph.DEFAULT_NODE_OPACITY;
            };

            /**
             * Returns the text for the given node.
             * @param {Object} node
             * @method createNodeText
             * @private
             * @return {String}
             */
            var createNodeText = function(node) {
                if(node.type === CLUSTER_TYPE) {
                    var nodesInCluster = $scope.selected.dateBucket ? node.nodesForSelectedDateBucket : node.nodes;
                    return nodesInCluster.length;
                }
                return "";
            };

            /**
             * Returns the tooltip for the given node.
             * @param {Object} node
             * @method createNodeTooltip
             * @private
             * @return {String}
             */
            var createNodeTooltip = function(node) {
                if(node.type === CLUSTER_TYPE) {
                    var nodesInCluster = $scope.selected.dateBucket ? node.nodesForSelectedDateBucket : node.nodes;
                    var size = 0;
                    nodesInCluster.forEach(function(nodeInCluster) {
                        size += getDatesInNodeOrLink(nodeInCluster).length;
                    });
                    return '<div class="graph-tooltip-block">' +
                        '<span class="graph-tooltip-value">Cluster of ' + nodesInCluster.length + '</span>' +
                        '</div>' +
                        '<div class="graph-tooltip-block">' +
                        '<span class="graph-tooltip-label">Total ' + $scope.tooltip.sizeLabel + '</span>' +
                        '<span class="graph-tooltip-value">' + size + '</span>' +
                        '</div>';
                }

                return '<div class="graph-tooltip-block">' +
                    '<span class="graph-tooltip-label">' + $scope.tooltip.nameLabel + '</span>' +
                    '<span class="graph-tooltip-value">' + node.name + '</span>' +
                    '</div>' +
                    '<div class="graph-tooltip-block">' +
                    '<span class="graph-tooltip-label">' + $scope.tooltip.idLabel + '</span>' +
                    '<span class="graph-tooltip-value">' + node.id + '</span>' +
                    '</div>' +
                    '<div class="graph-tooltip-block">' +
                    '<span class="graph-tooltip-label">' + $scope.tooltip.sizeLabel + '</span>' +
                    '<span class="graph-tooltip-value">' + getDatesInNodeOrLink(node).length + '</span>' +
                    '</div>' +
                    '<div class="graph-tooltip-block">' +
                    '<span class="graph-tooltip-label">' + $scope.tooltip.sourceSizeLabel + '</span>' +
                    '<span class="graph-tooltip-value">' + node.numberOfSources + '</span>' +
                    '</div>' +
                    '<div class="graph-tooltip-block">' +
                    '<span class="graph-tooltip-label">' + $scope.tooltip.targetSizeLabel + '</span>' +
                    '<span class="graph-tooltip-value">' + node.numberOfTargets + '</span>' +
                    '</div>';
            };

            /**
             * Returns the size for the given link.
             * @param {Object} link
             * @method calculateLinkSize
             * @private
             * @return {Number}
             */
            var calculateLinkSize = function(link) {
                return 2 + Math.min(8, Math.floor(getDatesInNodeOrLink(link).length / 5));
            };

            /**
             * Returns the color for the given link.
             * @param {Object} link
             * @method calculateLinkColor
             * @private
             * @return {String}
             */
            var calculateLinkColor = function(link) {
                if($scope.selected.mouseoverNetworkId === link.network || $scope.selected.graphNetworkId === link.network) {
                    return FOCUSED_COLOR;
                }
                return $scope.graph.DEFAULT_LINK_STROKE_COLOR;
            };

            /**
             * Returns the opacity for the given link.
             * @param {Object} link
             * @method calculateLinkOpacity
             * @private
             * @return {Number}
             */
            var calculateLinkOpacity = function(link) {
                return $scope.graph.DEFAULT_LINK_STROKE_OPACITY;
            };

            /**
             * Returns the name of the arrowhead marker for the given link.
             * @param {Object} link
             * @method getLinkArrowhead
             * @private
             * @return {String}
             */
            var getLinkArrowhead = function(link) {
                if($scope.selected.mouseoverNetworkId === link.network || $scope.selected.graphNetworkId === link.network) {
                    return FOCUSED_COLOR_ARROWHEAD;
                }
                return $scope.graph.DEFAULT_LINK_ARROWHEAD;
            };

            /**
             * Returns the tooltip for the given link.
             * @param {Object} link
             * @method createLinkTooltip
             * @private
             * @return {String}
             */
            var createLinkTooltip = function(link) {
                var sourceName = link.source.name;
                if(link.source.type === CLUSTER_TYPE) {
                    var nodesInCluster = $scope.selected.dateBucket ? link.source.nodesForSelectedDateBucket : link.source.nodes;
                    sourceName = "Cluster of " + nodesInCluster.length;
                }
                var targetName = link.target.name;
                if(link.target.type === CLUSTER_TYPE) {
                    var nodesInCluster = $scope.selected.dateBucket ? link.target.nodesForSelectedDateBucket : link.target.nodes;
                    targetName = "Cluster of " + nodesInCluster.length;
                }

                return '<div class="graph-tooltip-block">' +
                    '<span class="graph-tooltip-label">' + $scope.tooltip.sourceNameLabel + '</span>' +
                    '<span class="graph-tooltip-value">' + sourceName + '</span>' +
                    '</div>' +
                    '<div class="graph-tooltip-block">' +
                    '<span class="graph-tooltip-label">' + $scope.tooltip.targetNameLabel + '</span>' +
                    '<span class="graph-tooltip-value">' + targetName + '</span>' +
                    '</div>' +
                    '<div class="graph-tooltip-block">' +
                    '<span class="graph-tooltip-label">' + $scope.tooltip.sizeLabel + '</span>' +
                    '<span class="graph-tooltip-value">' + getDatesInNodeOrLink(link).length + '</span>' +
                    '</div>';
            };

            /**
             * Returns the key for the given node.
             * @param {Object} node
             * @method getNodeKey
             * @private
             * @return {String}
             */
            var getNodeKey = function(node) {
                return node.key;
            };

            /**
             * Returns the key for the given link.
             * @param {Object} link
             * @method getLinkKey
             * @private
             * @return {String}
             */
            var getLinkKey = function(link) {
                return link.key;
            };

            /**
             * Selects the network for the given node if it is not selected.
             * @param {Object} node
             * @method onNodeSelect
             * @private
             */
            var onNodeSelect = function(node) {
                $scope.selected.mouseoverNodeIds = getNodeIds(node);
                $scope.selected.mouseoverNetworkId = node.network;
                $scope.graph.redrawNodesAndLinks();
            };

            /**
             * Returns an array containing the ID of the given node.  If the given node is a cluster, returns an array containing the IDs of all of the nodes in the cluster.
             * @param {Object} node
             * @method getNodeIds
             * @private
             * @return {Array}
             */
            var getNodeIds = function(node) {
                if(node.type === CLUSTER_TYPE) {
                    // Note:  Return the IDs for all nodes in the cluster, not just the IDs for nodes in or before the selected date bucket.
                    return node.nodes.map(function(nodeInCluster) {
                        return nodeInCluster.id;
                    });
                }
                return [node.id];
            };

            /**
             * Deselects the network for the given node if it is selected.
             * @param {Object} node
             * @method onNodeDeselect
             * @private
             */
            var onNodeDeselect = function(node) {
                $scope.selected.mouseoverNodeIds = [];
                $scope.selected.mouseoverNetworkId = undefined;
                $scope.graph.redrawNodesAndLinks();
            };

            /**
             * Selects or deselects the network for the given node.
             * @param {Object} node
             * @method onNodeClick
             * @private
             */
            var onNodeClick = function(node) {
                addSelectedNode(node, true);
                $scope.$apply(function() {
                    redrawGraphAndShowSelectedNews();
                });
            };

            /**
             * Selects the given node and its network.  Deselects the given node if it is selected and deselectSelected is true.
             * @param {Object} node
             * @param {Boolean} deselectSelected (optional)
             * @method addSelectedNode
             * @private
             */
            var addSelectedNode = function(node, deselectSelected) {
                if(node.type === CLUSTER_TYPE) {
                    // Note:  Add the IDs for all nodes in the cluster, not just the IDs for nodes in or before the selected date bucket.
                    node.nodes.forEach(function(nodeInCluster) {
                        addSelectedNode(nodeInCluster, deselectSelected);
                    });
                } else {
                    addSelectedNodeAndNetwork(node.id, node.network, deselectSelected);
                }
            };

            /**
             * Selects the network for the given link if it is not selected.
             * @param {Object} link
             * @method onLinkSelect
             * @private
             */
            var onLinkSelect = function(link) {
                $scope.selected.mouseoverNodeIds = getNodeIds(link.source).concat(getNodeIds(link.target));
                $scope.selected.mouseoverNetworkId = link.network;
                $scope.graph.redrawNodesAndLinks();
            };

            /**
             * Deselects the network for the given link if it is selected.
             * @param {Object} link
             * @method onLinkDeselect
             * @private
             */
            var onLinkDeselect = function(link) {
                $scope.selected.mouseoverNodeIds = [];
                $scope.selected.mouseoverNetworkId = undefined;
                $scope.graph.redrawNodesAndLinks();
            };

            /**
             * Selects or deselects the network for the given link.
             * @param {Object} link
             * @method onLinkClick
             * @private
             */
            var onLinkClick = function(link) {
                addSelectedNode(link.source);
                addSelectedNode(link.target);
                $scope.$apply(function() {
                    redrawGraphAndShowSelectedNews();
                });
            };

            /**
             * Deselected all selected nodes and the selected node network in the graph.
             * @method deselectAllNodesAndNetwork
             */
            $scope.deselectAllNodesAndNetwork = function() {
                $scope.selected.graphNetworkId = undefined;
                $scope.selected.graphNodeIds = [];
                redrawGraphAndShowSelectedNews();
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
                if($scope.options.selectedNodeField.columnName && $scope.options.selectedLinkField.columnName) {
                    fields = [{
                        query: $scope.options.selectedNodeField.columnName,
                        pretty: $scope.options.selectedNodeField.prettyName
                    },{
                        query: $scope.options.selectedLinkField.columnName,
                        pretty: $scope.options.selectedLinkField.prettyName
                    }];
                    query.groupBy($scope.options.selectedNodeField.columnName, $scope.options.selectedLinkField.columnName);
                } else if($scope.options.selectedNodeField.columnName) {
                    fields = [{
                        query: $scope.options.selectedNodeField.columnName,
                        pretty: $scope.options.selectedNodeField.prettyName
                    }];
                    query.groupBy($scope.options.selectedNodeField.columnName);
                } else if($scope.options.selectedLinkField.columnName) {
                    fields = [{
                        query: $scope.options.selectedLinkField.columnName,
                        pretty: $scope.options.selectedLinkField.prettyName
                    }];
                    query.groupBy($scope.options.selectedLinkField.columnName);
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

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                initialize();
                displayActiveDataset(true);
            });
        }
    };
}]);
