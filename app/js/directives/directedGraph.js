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
            $scope.graphFilterValues = [];
            $scope.otherFilterValues = [];

            $scope.$watch('selectedNode', function() {
                if($scope.selectedNode !== "") {
                    if($scope.messenger && $scope.graphFilterValues.length) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                    $scope.graphFilterValues = [];
                    $scope.addFilter($scope.selectedNode);
                }
            }, true);

            var updateSize = function() {
                element.find('#directed-graph-div-' + $scope.uniqueId).height(element.height() - element.find('.config-row-div').outerHeight(true) - 10);
                return $timeout(redraw, 250);
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
                    filtersChanged: onFiltersChanged,
                    custom: [{
                        channel: "active_dataset_changed",
                        callback: onDatasetChanged
                    }]
                });

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                    if($scope.graphFilterValues.length) {
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
                        $scope.addOtherFilterValues(message.addedFilter.whereClause);
                    } else if(message.type.toUpperCase() === "REPLACE") {
                        $scope.removeOtherFilterValues(message.removedFilter.whereClause);
                        $scope.addOtherFilterValues(message.addedFilter.whereClause);
                    } else if(message.type.toUpperCase() === "REMOVE") {
                        $scope.removeOtherFilterValues(message.removedFilter.whereClause);
                    }
                    $scope.queryForData();
                }
            };

            $scope.addOtherFilterValues = function(whereClause) {
                if(whereClause.whereClauses) {
                    for(var i = 0; i < whereClause.whereClauses.length; ++i) {
                        $scope.addOtherFilterValues(whereClause.whereClauses[i]);
                    }
                } else if(whereClause.lhs === $scope.selectedField) {
                    for(var i = 0; i < $scope.otherFilterValues.length; ++i) {
                        if($scope.otherFilterValues[i].value === whereClause.rhs) {
                            $scope.otherFilterValues[i].count++;
                            return;
                        }
                    }
                    $scope.otherFilterValues.push({
                        count: 1,
                        value: whereClause.rhs
                    });
                }
            };

            $scope.removeOtherFilterValues = function(whereClause) {
                if(whereClause.whereClauses) {
                    for(var i = 0; i < whereClause.whereClauses.length; ++i) {
                        $scope.removeOtherFilterValues(whereClause.whereClauses[i]);
                    }
                } else if(whereClause.lhs === $scope.selectedField) {
                    var index;
                    for(index = 0; index < $scope.otherFilterValues.length; ++index) {
                        if($scope.otherFilterValues[index].value === whereClause.rhs) {
                            $scope.otherFilterValues[index].count--;
                            break;
                        }
                    }
                    if(!($scope.otherFilterValues[index].count)) {
                        $scope.otherFilterValues.splice(index, 1);
                    }
                }
            };

            var onDatasetChanged = function() {
                $scope.displayActiveDataset(false);
            };

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

                $scope.graphFilterValues.push(value);

                if($scope.messenger) {
                    var relations = datasetService.getRelations($scope.selectedTable.name, [$scope.selectedField]);
                    if($scope.graphFilterValues.length === 1) {
                        filterService.addFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilter, $scope.queryForData);
                    } else if($scope.graphFilterValues.length > 1) {
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
                var fullWhereClause = neon.query.where(fieldName, '=', $scope.graphFilterValues[0]);
                for(var i = 1; i < $scope.graphFilterValues.length; ++i) {
                    var whereClause = neon.query.where(fieldName, '=', $scope.graphFilterValues[i]);
                    fullWhereClause = neon.query.or(fullWhereClause, whereClause);
                }
                return new neon.query.Filter().selectFrom($scope.databaseName, tableName).where(fullWhereClause);
            }

            $scope.removeFilter = function(value) {
                var index = $scope.graphFilterValues.indexOf(value);
                if(index !== -1) {
                    $scope.graphFilterValues.splice(index, 1);
                }

                if($scope.messenger) {
                    if($scope.graphFilterValues.length === 0) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys, $scope.queryForData);
                    } else {
                        var relations = datasetService.getRelations($scope.selectedTable.name, [$scope.selectedField]);
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilter, $scope.queryForData);
                    }
                }
            };

            $scope.clearFilters = function() {
                $scope.graphFilterValues = [];
                if($scope.messenger) {
                    filterService.removeFilters($scope.messenger, $scope.filterKeys, $scope.queryForData);
                }
            };

            $scope.queryForData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                if($scope.graphFilterValues.length || $scope.otherFilterValues.length) {
                    $scope.queryForFilteredData();
                } else {
                    $scope.queryForNodes();
                }
            };

            $scope.queryForNodes = function() {
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
                        $scope.nodes.sort(function(a, b) {
                            return a.toLowerCase().localeCompare(b.toLowerCase())
                        });
                        $scope.graph.setClickableNodes($scope.nodes);
                        $scope.createAndShowGraph(data);
                    }, function(response) {
                        $scope.updateGraph([], []);
                        $scope.errorMessage = errorNotificationService.showErrorMessage(element, response.responseJSON.error, response.responseJSON.stackTrace);
                    });
                }
            };

            $scope.queryForFilteredData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var allFilterValues = $scope.getAllFilterValues();

                var query = new neon.query.Query()
                    .selectFrom($scope.databaseName, $scope.selectedTable.name);

                var where = neon.query.where($scope.selectedField, '=', allFilterValues[0]);
                var orWhere;
                for(var i = 1; i < allFilterValues.length; i++) {
                    orWhere = neon.query.where($scope.selectedField, '=', allFilterValues[i]);
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

            $scope.getAllFilterValues = function() {
                var allFilterValues = [];
                for(var i = 0; i < $scope.graphFilterValues.length; ++i) {
                    allFilterValues.push($scope.graphFilterValues[i]);
                }
                for(var i = 0; i < $scope.otherFilterValues.length; ++i) {
                    if(allFilterValues.indexOf($scope.otherFilterValues[i].value) < 0) {
                        allFilterValues.push($scope.otherFilterValues[i].value);
                    }
                }
                return allFilterValues;
            };

            $scope.createAndShowGraph = function(response) {
                var data = response.data;
                if(data.length >= 500) {
                    data = data.slice(0, 500);
                }

                var nodesIndexes = {};
                var nodes = [];
                var linksIndexes = {};
                var links = [];
                var allFilterValues = $scope.getAllFilterValues();

                var addNodesIfUnique = function(value) {
                    if(nodesIndexes[value] === undefined) {
                        nodesIndexes[value] = nodes.length;
                        var colorGroup;
                        if(allFilterValues.indexOf(value) !== -1) {
                            colorGroup = 1;
                        } else if($scope.nodes.indexOf(value) !== -1) {
                            colorGroup = 3;
                        } else {
                            colorGroup = 2;
                        }
                        nodes.push({
                            name: value,
                            group: colorGroup
                        });
                    }
                    return nodesIndexes[value];
                };

                var addLinkIfUnique = function(node1, node2) {
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

                var node1;
                var node2;
                var relatedNodes;
                for(var i = 0; i < data.length; i++) {
                    if(data[i][$scope.selectedField]) {
                        node1 = addNodesIfUnique(data[i][$scope.selectedField]);
                        relatedNodes = (data[i].attributeList ? data[i].attributeList : []);
                        if(relatedNodes.length >= 500) {
                            relatedNodes = relatedNodes.slice(0, 500);
                        }

                        for(var j = 0; j < relatedNodes.length; j++) {
                            node2 = addNodesIfUnique(relatedNodes[j]);
                            addLinkIfUnique(node1, node2);
                        }
                    }
                }

                $scope.graph.setRootNodes(allFilterValues);
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
                    if($scope.graphFilterValues.indexOf(item.name) === -1) {
                        $scope.$apply(function() {
                            $scope.addFilter(item.name);
                        });
                    }
                    else {
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
