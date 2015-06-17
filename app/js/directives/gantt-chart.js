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
.directive('ganttChart', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService',
function(connectionService, datasetService, errorNotificationService, filterService) {
    return {
        templateUrl: 'partials/directives/gantt-chart.html',
        restrict: 'EA',
        scope: {

        },
        link: function($scope, $element) {
            $element.addClass('gantt-chart');
            $scope.element = $element;
            $scope.legend = {};

            $scope.options = {
                database: {},
                table: {},
                groupField: []
            };

            //query for data
            //build config

            var buildTree = function(data) {
                $scope.tree = {};

                for(var i = 0; i < data.length; i++) {
                    var groupValue1;
                    if($scope.options.groupField[0]) {
                        groupValue1 = data[i][$scope.options.groupField[0]];
                        if(!$scope.tree[groupValue1]) {
                            if($scope.options.groupField.length === 1) {
                                $scope.tree[data[i][$scope.options.groupField[0]]] = {
                                    tasks: []
                                };
                            } else {
                                $scope.tree[data[i][$scope.options.groupField[0]]] = {};
                            }
                        }
                    }

                    var groupValue2;
                    if($scope.options.groupField[1]) {
                        groupValue2 = data[i][$scope.options.groupField[1]];

                        if(!$scope.tree[groupValue1][groupValue2]) {
                            if($scope.options.groupField.length === 2) {
                                $scope.tree[groupValue1][groupValue2] = {
                                    tasks: []
                                };
                            } else {
                                $scope.tree[groupValue1][groupValue2] = {};
                            }
                        }
                    }

                    var groupValue3;
                    if($scope.options.groupField[2]) {
                        groupValue3 = data[i][$scope.options.groupField[2]];

                        if(!$scope.tree[groupValue1][groupValue2][groupValue3]) {
                            if($scope.options.groupField.length === 3) {
                                $scope.tree[groupValue1][groupValue2][groupValue3] = {
                                    tasks: []
                                };
                            } else {
                                $scope.tree[groupValue1][groupValue2][groupValue3] = {};
                            }
                        }
                    }

                    var groupValue4;
                    if($scope.options.groupField[3]) {
                        groupValue4 = data[i][$scope.options.groupField[3]];

                        if(!$scope.tree[groupValue1][groupValue2][groupValue3][groupValue4]) {
                            if($scope.options.groupField.length === 3) {
                                $scope.tree[groupValue1][groupValue2][groupValue3][groupValue4] = {
                                    tasks: []
                                };
                            } else {
                                $scope.tree[groupValue1][groupValue2][groupValue3][groupValue4] = {};
                            }
                        }
                    }
                }
            };

            var formatData = function(data) {
                var i;
                var color = d3.scale.category20();
                var colorList;
                if($scope.options.colorField) {
                    colorList = createFieldList($scope.options.colorField, data);
                    $scope.legend.colors = [];
                    for(i = 0; i < colorList.length; i++) {
                        $scope.legend.colors.push({
                            color: color(i),
                            text: colorList[i]
                        });
                    }
                }

                if($scope.options.groupField.length > 0) {
                    $scope.data = [];
                    buildTree(data);
                } else {
                    $scope.tree = undefined;
                    var mainTask = {
                        name: "Events"
                    };
                    $scope.data = [mainTask];
                }

                var row;

                for(i = 0; i < data.length; i++) {
                    var parent;
                    if(!$scope.tree) {
                        parent = {
                            parent: 'Events',
                            tasks: []
                        };
                        $scope.data.push(parent);
                    } else {
                        parent = getTreeParent(data[i]);
                    }

                    var colorVal;
                    if($scope.options.colorField) {
                        colorVal = color(colorList.indexOf(data[i][$scope.options.colorField]));
                    } else {
                        colorVal = color(i);
                    }
                    row = {
                        name: data[i].Headline,
                        from: data[i].Start,
                        to: data[i].End,
                        color: colorVal
                    };
                    parent.tasks.push(row);
                }

                pushTreeToData();
            };

            var createFieldList = function(field, data) {
                var fieldList = [];
                var value;
                for(var i = 0; i < data.length; i++) {
                    value = data[i][field];
                    if(fieldList.indexOf(value) === -1) {
                        fieldList.push(value);
                    }
                }
                return fieldList;
            };

            var getTreeParent = function(node) {
                var groupValues = [];
                var parent;
                if($scope.options.groupField.length === 1) {
                    parent = $scope.tree[node[$scope.options.groupField[0]]];
                } else if($scope.options.groupField.length === 2) {
                    groupValues[0] = node[$scope.options.groupField[0]];
                    groupValues[1] = node[$scope.options.groupField[1]];
                    parent = $scope.tree[groupValues[0]][groupValues[1]];
                } else if($scope.options.groupField.length === 3) {
                    groupValues[0] = node[$scope.options.groupField[0]];
                    groupValues[1] = node[$scope.options.groupField[1]];
                    groupValues[2] = node[$scope.options.groupField[2]];
                    parent = $scope.tree[groupValues[0]][groupValues[1]][groupValues[2]];
                } else if($scope.options.groupField.length === 4) {
                    groupValues[0] = node[$scope.options.groupField[0]];
                    groupValues[1] = node[$scope.options.groupField[1]];
                    groupValues[2] = node[$scope.options.groupField[2]];
                    groupValues[3] = node[$scope.options.groupField[3]];
                    parent = $scope.tree[groupValues[0]][groupValues[1]][groupValues[2]][groupValues[3]];
                }
                return parent;
            };

            var pushTreeToData = function() {
                for(var key in $scope.tree) {
                    if($scope.tree.hasOwnProperty(key)) {
                        pushTreeNodeToData($scope.tree[key], key);
                    }
                }
            };

            var pushTreeNodeToData = function(node, nodeName, parentName) {
                if(node.tasks) {
                    $scope.data.push({
                        parent: parentName,
                        name: nodeName,
                        tasks: node.tasks
                    });
                } else {
                    var newNode = {
                        name: nodeName
                    };
                    if(parent) {
                        newNode.parent = parentName;
                    }
                    $scope.data.push(newNode);

                    for(var key in node) {
                        if(node.hasOwnProperty(key)) {
                            pushTreeNodeToData(node[key], key, nodeName);
                        }
                    }
                }
            };

            var initialize = function() {
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "count-by",
                        elementType: "datagrid",
                        elementSub: "count-by",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["remove", "count-by"]
                    });
                    $scope.messenger.removeEvents();
                    if($scope.filterSet) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                });
            };

            var onFiltersChanged = function() {
                $scope.queryForData();
            };

            $scope.displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset() || $scope.loadingData) {
                    return;
                }

                $scope.databases = datasetService.getDatabases();
                $scope.options.database = $scope.databases[0];
                if($scope.bindDatabase) {
                    for(var i = 0; i < $scope.databases.length; ++i) {
                        if($scope.bindDatabase === $scope.databases[i].name) {
                            $scope.options.database = $scope.databases[i];
                            break;
                        }
                    }
                }

                if(initializing) {
                    $scope.updateTables();
                } else {
                    $scope.$apply(function() {
                        $scope.updateTables();
                    });
                }
            };

            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.database.name);
                $scope.options.table = $scope.tables[0];
                if($scope.bindTable) {
                    for(var i = 0; i < $scope.tables.length; ++i) {
                        if($scope.bindTable === $scope.tables[i].name) {
                            $scope.options.table = $scope.tables[i];
                            break;
                        }
                    }
                }
                $scope.updateFields();
            };

            $scope.updateFields = function() {
                $scope.loadingData = true;
                $scope.fields = datasetService.getDatabaseFields($scope.options.database.name, $scope.options.table.name);
                $scope.fields.sort();

                $scope.queryForData();
            };

            $scope.queryForData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection) {
                    $scope.loadingData = false;
                    return;
                }

                var query = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name);

                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "gantt-chart",
                    elementType: "canvas",
                    elementSub: "gantt-chart",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["query", "gantt-chart"]
                });

                connection.executeQuery(query, function(queryResults) {
                    $scope.$apply(function() {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "receive",
                            elementId: "gantt-chart",
                            elementType: "canvas",
                            elementSub: "gantt-chart",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["receive", "gantt-chart"]
                        });

                        $scope.queryData = queryResults.data;
                        formatData($scope.queryData);
                        $scope.loadingData = false;

                        XDATA.userALE.log({
                            activity: "alter",
                            action: "render",
                            elementId: "gantt-chart",
                            elementType: "canvas",
                            elementSub: "gantt-chart",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["render", "gantt-chart"]
                        });
                    });
                }, function(response) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "failed",
                        elementId: "gantt-chart",
                        elementType: "canvas",
                        elementSub: "gantt-chart",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["failed", "gantt-chart"]
                    });

                    formatData(queryResults.data);
                    $scope.loadingData = false;

                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            $scope.$watch('options.groupField', function(newValue) {
                var length = newValue.length;
                if(!$scope.options.groupField[0]) {
                    $scope.options.groupField = [];
                } else if(!$scope.options.groupField[1]) {
                    $scope.options.groupField.splice(1, 3);
                } else if(!$scope.options.groupField[2]) {
                    $scope.options.groupField.splice(2, 2);
                } else if(!$scope.options.groupField[3]) {
                    $scope.options.groupField.splice(3, 1);
                }

                if(length === newValue.length) {
                    $scope.queryForData();
                }
            }, true);

            $scope.$watch('options.colorField', function() {
                if($scope.options.colorField) {
                    formatData($scope.queryData);
                }
            }, true);

            neon.ready(function() {
                $scope.messenger = new neon.eventing.Messenger();
                initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
