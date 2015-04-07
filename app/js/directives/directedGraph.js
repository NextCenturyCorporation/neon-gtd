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
.directive('directedGraph', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', '$timeout', function(connectionService, datasetService, errorNotificationService, $timeout) {
    return {
        templateUrl: 'partials/directives/directedGraph.html',
        restrict: 'EA',
        scope: {
            startingFields: '='
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
            $scope.filterKey = "graph-" + uuid();
            $scope.errorMessage = undefined;

            if($scope.startingFields) {
                $scope.groupFields = $scope.startingFields;
            } else {
                $scope.groupFields = [];
            }

            $scope.$watch('selectedNode', function() {
                if($scope.selectedNode !== "") {
                    if($scope.messenger && $scope.groupFields.length) {
                        $scope.messenger.removeFilter($scope.filterKey);
                    }
                    $scope.groupFields = [];
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
                    if($scope.groupFields.length) {
                        $scope.messenger.removeFilter($scope.filterKey);
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
                if(message.filter.databaseName === $scope.databaseName && message.filter.tableName === $scope.selectedTable.name) {
                    $scope.queryForData();
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
                        shiftClickHandler: $scope.shiftClickHandler
                    });
                }

                $scope.databaseName = datasetService.getDatabase();
                $scope.tables = datasetService.getTables();
                $scope.selectedTable = datasetService.getFirstTableWithMappings(["graph_nodes"]) || $scope.tables[0];
                $scope.data = [];

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

                $scope.groupFields.push(value);

                if($scope.messenger) {
                    var filter = $scope.createFilter();
                    $scope.messenger.addFilter($scope.filterKey, filter, function() {
                        $scope.queryForData();
                    });
                }
            };

            $scope.createFilter = function() {
                var filterWhereClause = neon.query.where($scope.selectedField, '=', $scope.groupFields[0]);
                for(var i = 1; i < $scope.groupFields.length; ++i) {
                    var filterOrClause = neon.query.where($scope.selectedField, '=', $scope.groupFields[i]);
                    filterWhereClause = neon.query.or(filterWhereClause, filterOrClause);
                }
                return new neon.query.Filter().selectFrom($scope.databaseName, $scope.selectedTable.name).where(filterWhereClause);
            }

            $scope.removeFilter = function(value) {
                var index = $scope.groupFields.indexOf(value);
                if(index !== -1) {
                    $scope.groupFields.splice(index, 1);
                }

                if($scope.messenger) {
                    if($scope.groupFields.length === 0) {
                        $scope.messenger.removeFilter($scope.filterKey, function() {
                            $scope.queryForData();
                        });
                    } else {
                        var filter = $scope.createFilter();
                        $scope.messenger.replaceFilter($scope.filterKey, filter, function() {
                            $scope.queryForData();
                        });
                    }
                }
            };

            $scope.clearFilters = function() {
                $scope.groupFields = [];
                if($scope.messenger) {
                    $scope.messenger.removeFilter($scope.filterKey, function() {
                        $scope.queryForData();
                    });
                }
            };

            $scope.queryForData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                if($scope.groupFields.length) {
                    $scope.queryForFilteredData();
                } else {
                    $scope.queryForNodes();
                }
            };

            $scope.queryForNodes = function() {
                var query = new neon.query.Query()
                    .selectFrom($scope.databaseName, $scope.selectedTable.name)
                    .withFields([$scope.selectedField]);
                query.ignoreFilters([$scope.filterKey]);

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

                var query = new neon.query.Query()
                    .selectFrom($scope.databaseName, $scope.selectedTable.name);

                var where = neon.query.where($scope.selectedField, '=', $scope.groupFields[0]);
                var orWhere;
                for(var i = 1; i < $scope.groupFields.length; i++) {
                    orWhere = neon.query.where($scope.selectedField, '=', $scope.groupFields[i]);
                    where = neon.query.or(where, orWhere);
                }
                query = query.where(where);
                query.ignoreFilters([$scope.filterKey]);

                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connection.executeQuery(query, $scope.createAndShowGraph, function(response) {
                        $scope.updateGraph([], []);
                        $scope.errorMessage = errorNotificationService.showErrorMessage(element, response.responseJSON.error, response.responseJSON.stackTrace);
                    });
                }
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

                var addNodesIfUnique = function(value) {
                    if(nodesIndexes[value] === undefined) {
                        nodesIndexes[value] = nodes.length;
                        var colorGroup;
                        if($scope.groupFields.indexOf(value) !== -1) {
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

                $scope.graph.setRootNodes($scope.groupFields);
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

            $scope.shiftClickHandler = function(item) {
                if($scope.nodes.indexOf(item.name) !== -1) {
                    if($scope.groupFields.indexOf(item.name) === -1) {
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
