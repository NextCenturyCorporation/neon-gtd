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
.directive('directedGraph',['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', '$timeout', function(connectionService, datasetService, errorNotificationService, filterService, $timeout) {
    return {
        templateUrl: 'partials/directives/directedGraph.html',
        restrict: 'EA',
        scope: {
        },
        link: function($scope, element) {
            $scope.uniqueChartOptions = 'chart-options-' + uuid();
            var chartOptions = $(element).find('.chart-options');
            chartOptions.toggleClass($scope.uniqueChartOptions);

            element.addClass('directedGraphDirective');

            $scope.TIMEOUT_MS = 250;
            $scope.uniqueId = uuid();
            $scope.databaseName = "";
            $scope.tables = [];
            $scope.selectedTable = {
                name: ""
            };
            $scope.fields = [];
            $scope.selectedField = "";
            $scope.nodes = [];
            $scope.selectedNode = "";
            $scope.numberOfNodesInGraph = 0;
            $scope.nodeLimit = 500;
            $scope.filterKeys = {};
            $scope.errorMessage = undefined;

            // Store the filter fields selected in the graph and in other visualizations (found through filter changed events).
            $scope.graphFilteredData = [];
            $scope.otherFilteredData = [];

            $scope.$watch('selectedNode', function() {
                if($scope.selectedNode !== "") {
                    if($scope.messenger && $scope.graphFilteredData.length) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                    $scope.graphFilteredData = [];
                    $scope.addFilter($scope.selectedNode);
                }
            }, true);

            var updateSize = function() {
                var paddingTop = (element.outerHeight(true) - element.height()) / 2;
                var headerHeight = element.find('.config-row-div').outerHeight(true);
                element.find('#directed-graph-div-' + $scope.uniqueId).height(element.height() - paddingTop - headerHeight);
                return $timeout(redraw, $scope.TIMEOUT_MS);
            };

            var redraw = function() {
                if($scope.graph) {
                    $scope.graph.redraw();
                }
                $scope.resizePromise = null;
            };

            $scope.initialize = function() {
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe("dataset_changed", onDatasetChanged);

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                    if($scope.graphFilteredData.length) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                });

                element.resize(function() {
                    if($scope.resizePromise) {
                        $timeout.cancel($scope.resizePromise);
                    }
                    $scope.resizePromise = updateSize();
                });
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message.addedFilter.databaseName === $scope.databaseName && message.addedFilter.tableName === $scope.selectedTable.name) {
                    if(message.type.toUpperCase() === "ADD") {
                        $scope.addOtherFilteredData(message.addedFilter.whereClause);
                    } else if(message.type.toUpperCase() === "REPLACE") {
                        $scope.removeOtherFilteredData(message.removedFilter.whereClause);
                        $scope.addOtherFilteredData(message.addedFilter.whereClause);
                    } else if(message.type.toUpperCase() === "REMOVE") {
                        $scope.removeOtherFilteredData(message.removedFilter.whereClause);
                    }
                    $scope.queryForData();
                }
            };

            /**
             * Adds the filter with the given where clause to the list of filters set by other visualizations so we can
             * query for a network graph using those filters in addition to the filters set by the graph.
             * @param {Object} A where clause containing either {String} lhs and {String} rhs or {Array} whereClauses
             * containing other where clause Objects.
             * @method addOtherFilteredData
             */
            $scope.addOtherFilteredData = function(whereClause) {
                if(whereClause.whereClauses) {
                    for(var i = 0; i < whereClause.whereClauses.length; ++i) {
                        $scope.addOtherFilteredData(whereClause.whereClauses[i]);
                    }
                } else {
                    for(var j = 0; j < $scope.otherFilteredData.length; ++j) {
                        if($scope.otherFilteredData[j].field === whereClause.lhs && $scope.otherFilteredData[j].value === whereClause.rhs) {
                            $scope.otherFilteredData[j].count++;
                            return;
                        }
                    }
                    $scope.otherFilteredData.push({
                        field: whereClause.lhs,
                        value: whereClause.rhs,
                        count: 1
                    });
                }
            };

            /**
             * Removes the filter with the given where clause from the list of filters set by other visualizations.
             * @param {Object} A where clause containing either {String} lhs and {String} rhs or {Array} whereClauses
             * containing other where clause Objects.
             * @method removeOtherFilteredData
             */
            $scope.removeOtherFilteredData = function(whereClause) {
                if(whereClause.whereClauses) {
                    for(var i = 0; i < whereClause.whereClauses.length; ++i) {
                        $scope.removeOtherFilteredData(whereClause.whereClauses[i]);
                    }
                } else {
                    var index;
                    for(index = 0; index < $scope.otherFilteredData.length; ++index) {
                        if($scope.otherFilteredData[index].field === whereClause.lhs && $scope.otherFilteredData[index].value === whereClause.rhs) {
                            $scope.otherFilteredData[index].count--;
                            break;
                        }
                    }
                    if(!($scope.otherFilteredData[index].count)) {
                        $scope.otherFilteredData.splice(index, 1);
                    }
                }
            };

            /**
             * Event handler for dataset changed events issued over Neon's messaging channels.
             * @method onDatasetChanged
             * @private
             */
            var onDatasetChanged = function() {
                $scope.displayActiveDataset(false);
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             */
            $scope.displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset()) {
                    return;
                }

                if(!$scope.graph) {
                    $scope.graph = new charts.DirectedGraph(element[0], ('#directed-graph-div-' + $scope.uniqueId), {
                        clickHandler: $scope.createClickHandler
                    });
                }

                $scope.data = [];
                $scope.databaseName = datasetService.getDatabase();
                $scope.tables = datasetService.getTables();
                $scope.selectedTable = datasetService.getFirstTableWithMappings(["graph_nodes"]) || $scope.tables[0];
                $scope.filterKeys = filterService.createFilterKeys("graph", $scope.tables);

                if(initializing) {
                    $scope.updateFieldsAndQueryForData();
                } else {
                    $scope.$apply(function() {
                        $scope.updateFieldsAndQueryForData();
                    });
                }
            };

            $scope.updateFieldsAndQueryForData = function() {
                $scope.fields = datasetService.getDatabaseFields($scope.selectedTable.name);
                $scope.selectedField = datasetService.getMapping($scope.selectedTable.name, "graph_nodes") || "";
                $scope.queryForData();
            };

            $scope.addFilter = function(value) {
                $scope.selectedNode = "";

                $scope.graphFilteredData.push(value);

                if($scope.messenger) {
                    var relations = datasetService.getRelations($scope.selectedTable.name, [$scope.selectedField]);
                    if($scope.graphFilteredData.length === 1) {
                        filterService.addFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilter, $scope.queryForData);
                    } else if($scope.graphFilteredData.length > 1) {
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilter, $scope.queryForData);
                    }
                }
            };

            /**
             * Creates and returns a filter using the given table and fields.
             * @param {String} The name of the table on which to filter
             * @param {Array} An array containing the name of the selected field as its first element
             * @method createFilter
             * @return {Object} A neon.query.Filter object
             */
            $scope.createFilter = function(tableName, fieldNames) {
                var fieldName = fieldNames[0];
                var fullWhereClause = neon.query.where(fieldName, '=', $scope.graphFilteredData[0]);
                for(var i = 1; i < $scope.graphFilteredData.length; ++i) {
                    var whereClause = neon.query.where(fieldName, '=', $scope.graphFilteredData[i]);
                    fullWhereClause = neon.query.or(fullWhereClause, whereClause);
                }
                return new neon.query.Filter().selectFrom($scope.databaseName, tableName).where(fullWhereClause);
            };

            $scope.removeFilter = function(value) {
                var index = $scope.graphFilteredData.indexOf(value);
                if(index !== -1) {
                    $scope.graphFilteredData.splice(index, 1);
                }

                if($scope.messenger) {
                    if($scope.graphFilteredData.length === 0) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys, $scope.queryForData);
                    } else {
                        var relations = datasetService.getRelations($scope.selectedTable.name, [$scope.selectedField]);
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilter, $scope.queryForData);
                    }
                }
            };

            $scope.clearFilters = function() {
                $scope.graphFilteredData = [];
                if($scope.messenger) {
                    filterService.removeFilters($scope.messenger, $scope.filterKeys, $scope.queryForData);
                }
            };

            $scope.queryForData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var filteredData = $scope.getFilteredData();
                if(filteredData.length) {
                    $scope.queryForFilteredData(filteredData);
                } else {
                    $scope.queryForNodeData();
                }
            };

            /**
             * Query for the list of nodes using the selected field and draw the graph containing those nodes.
             */
            $scope.queryForNodeData = function() {
                var query = new neon.query.Query()
                    .selectFrom($scope.databaseName, $scope.selectedTable.name)
                    .withFields([$scope.selectedField]);
                query.ignoreFilters([$scope.filterKeys[$scope.selectedTable.name]]);

                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connection.executeQuery(query, function(data) {
                        $scope.nodes = [];
                        for(var i = 0; i < data.data.length; i++) {
                            var node = data.data[i][$scope.selectedField];
                            if($scope.nodes.indexOf(node) < 0) {
                                $scope.nodes.push(node);
                            }
                        }

                        // Sort the nodes so they are displayed in order in the options dropdown.
                        $scope.nodes.sort(function(a, b) {
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

                        $scope.graph.setClickableNodes($scope.nodes);
                        $scope.createAndShowGraph(data);
                    }, function(response) {
                        $scope.updateGraph([], []);
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage(element, response.responseJSON.error, response.responseJSON.stackTrace);
                        } else {
                            $scope.errorMessage = errorNotificationService.showErrorMessage(element, "Error", response);
                        }
                    });
                }
            };

            /**
             * Query for the list of nodes that link to the filtered nodes and draw the graph containing the network.
             * @param {Array} The array of filtered nodes as Strings
             */
            $scope.queryForFilteredData = function(filteredData) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var query = new neon.query.Query()
                    .selectFrom($scope.databaseName, $scope.selectedTable.name);

                var where = neon.query.where($scope.selectedField, '=', filteredData[0]);
                var orWhere;
                for(var i = 1; i < filteredData.length; i++) {
                    orWhere = neon.query.where($scope.selectedField, '=', filteredData[i]);
                    where = neon.query.or(where, orWhere);
                }
                query = query.where(where);
                query.ignoreFilters([$scope.filterKeys[$scope.selectedTable.name]]);

                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connection.executeQuery(query, $scope.createAndShowGraph, function(response) {
                        $scope.updateGraph([], []);
                        $scope.errorMessage = errorNotificationService.showErrorMessage(element, response.responseJSON.error, response.responseJSON.stackTrace);
                    });
                }
            };

            /**
             * Returns a string array containing the values of the filtered data in all visualizations for the field
             * selected in the graph.
             * @method getFilteredData
             * @return {Array} An array of strings with which to build the query to create a network graph
             */
            $scope.getFilteredData = function() {
                var filteredData = [];
                for(var i = 0; i < $scope.graphFilteredData.length; ++i) {
                    filteredData.push($scope.graphFilteredData[i]);
                }
                for(var j = 0; j < $scope.otherFilteredData.length; ++j) {
                    if($scope.otherFilteredData[j].field === $scope.selectedField && filteredData.indexOf($scope.otherFilteredData[j].value) < 0) {
                        filteredData.push($scope.otherFilteredData[j].value);
                    }
                }
                return filteredData;
            };

            $scope.createAndShowGraph = function(response) {
                var data = response.data;
                if(data.length >= $scope.nodeLimit) {
                    data = data.slice(0, $scope.nodeLimit);
                }

                // Maps a node value to a unique node ID to ensure each node we add to the graph is unique.
                var nodesIndexes = {};
                // Maps two node IDs to a unique link ID to ensure each link we add to the graph is unique.
                var linksIndexes = {};
                // The nodes to be added to the graph.
                var nodes = [];
                // The links to be added to the graph.
                var links = [];
                // The array of filtered data strings.
                var filteredData = $scope.getFilteredData();

                var addNodeIfUnique = function(value) {
                    if(nodesIndexes[value] === undefined) {
                        nodesIndexes[value] = nodes.length;
                        var colorGroup = 2;
                        if(filteredData.indexOf(value) !== -1) {
                            colorGroup = 1;
                        } else if($scope.nodes.indexOf(value) !== -1) {
                            colorGroup = 3;
                        }

                        nodes.push({
                            name: value,
                            group: colorGroup
                        });
                    }
                };

                var addLinkIfUnique = function(value1, value2) {
                    var node1 = nodesIndexes[value1];
                    var node2 = nodesIndexes[value2];

                    if(!linksIndexes[node1]) {
                        linksIndexes[node1] = {};
                    }

                    if(!linksIndexes[node1][node2]) {
                        linksIndexes[node1][node2] = links.length;
                        links.push({
                            source: node1,
                            target: node2,
                            value: 1
                        });
                    }
                };

                // Add each unique value from the data to the graph as a node.
                for(var i = 0; i < data.length; i++) {
                    var value = data[i][$scope.selectedField];
                    if(value) {
                        addNodeIfUnique(value);

                        var relatedNodes = (data[i].attributeList ? data[i].attributeList : []);
                        if(relatedNodes.length >= $scope.nodeLimit) {
                            relatedNodes = relatedNodes.slice(0, $scope.nodeLimit);
                        }

                        // Add each related node to the graph as a node with a link to the original node.
                        for(var j = 0; j < relatedNodes.length; j++) {
                            addNodeIfUnique(relatedNodes[j]);
                            addLinkIfUnique(value, relatedNodes[j]);
                        }
                    }
                }

                $scope.graph.setRootNodes(filteredData);
                $scope.updateGraph(nodes, links);
            };

            $scope.updateGraph = function(nodes, links) {
                $scope.$apply(function() {
                    $scope.numberOfNodesInGraph = nodes.length;
                });

                $scope.graph.updateGraph({
                    nodes: nodes,
                    links: links
                });
            };

            $scope.createClickHandler = function(item) {
                if($scope.nodes.indexOf(item.name) !== -1) {
                    if($scope.graphFilteredData.indexOf(item.name) === -1) {
                        $scope.$apply(function() {
                            $scope.addFilter(item.name);
                        });
                    } else {
                        $scope.$apply(function() {
                            $scope.removeFilter(item.name);
                        });
                    }
                }
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
