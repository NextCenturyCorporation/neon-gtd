'use strict';

/*
 * Copyright 2015 Next Century Corporation
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
            bindRowTitleField: "="
        },
        link: function($scope, $element) {
            $element.addClass('gantt-chart-directive');
            $scope.element = $element;
            $scope.legend = {};
            $scope.filterKeys = filterService.createFilterKeys("gantt-chart", datasetService.getDatabaseAndTableNames());
            $scope.filterSet = {};

            $scope.bindings = {
                rowTitleField: ($scope.bindRowTitleField || "_id"),
                startField: ($scope.BindStartField || "Start"),
                endField: ($scope.BindEndField || "End")
            };

            $scope.options = {
                database: {},
                table: {},
                firstGroupField: {},
                secondGroupField: {},
                thirdGroupField: {},
                fourthGroupField: {}
            };

            $scope.registerHooks = function(ganttApi) {
                ganttApi.directives.on.new($scope, function(dName, dScope, dElement) {
                    if(dName === "ganttTaskContent") {
                        dElement.attr('data-id', dScope.task.model.id);
                        dElement.bind('click', function(event) {
                            var clickedElement = $(event.currentTarget);
                            $scope.filterById(clickedElement.attr('data-id'));
                        });
                    }
                });
            };

            $scope.filterById = function(id) {
                var connection = connectionService.getActiveConnection();
                if($scope.messenger && connection) {
                    var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, ['_id']);
                    filterService.addFilters($scope.messenger, relations, $scope.filterKeys, function() {
                        return neon.query.where('_id', '=', id);
                    }, "Gantt Chart", function() {
                        $scope.filterSet.key = "_id";
                        $scope.filterSet.value = id;
                        $scope.queryForData();
                    });
                }
            };

            $scope.removeFilter = function() {
                filterService.removeFilters($scope.messenger, $scope.filterKeys, function() {
                    $scope.filterSet = {};
                    $scope.queryForData();
                });
            };

            var buildTree = function(data) {
                $scope.tree = {};

                for(var i = 0; i < data.length; i++) {
                    var groupValue1;
                    if($scope.options.firstGroupField && $scope.options.firstGroupField.columnName) {
                        groupValue1 = data[i][$scope.options.firstGroupField.columnName];
                        if(!$scope.tree[groupValue1]) {
                            if(!$scope.options.secondGroupField || !$scope.options.secondGroupField.columnName) {
                                $scope.tree[data[i][$scope.options.firstGroupField.columnName]] = {
                                    tasks: []
                                };
                            } else {
                                $scope.tree[data[i][$scope.options.firstGroupField.columnName]] = {};
                            }
                        }
                    }

                    var groupValue2;
                    if($scope.options.secondGroupField && $scope.options.secondGroupField.columnName) {
                        groupValue2 = data[i][$scope.options.secondGroupField.columnName];

                        if(!$scope.tree[groupValue1][groupValue2]) {
                            if(!$scope.options.thirdGroupField || !$scope.options.thirdGroupField.columnName) {
                                $scope.tree[groupValue1][groupValue2] = {
                                    tasks: []
                                };
                            } else {
                                $scope.tree[groupValue1][groupValue2] = {};
                            }
                        }
                    }

                    var groupValue3;
                    if($scope.options.thirdGroupField && $scope.options.thirdGroupField.columnName) {
                        groupValue3 = data[i][$scope.options.thirdGroupField.columnName];

                        if(!$scope.tree[groupValue1][groupValue2][groupValue3]) {
                            if(!$scope.options.fourthGroupField || !$scope.options.fourthGroupField.columnName) {
                                $scope.tree[groupValue1][groupValue2][groupValue3] = {
                                    tasks: []
                                };
                            } else {
                                $scope.tree[groupValue1][groupValue2][groupValue3] = {};
                            }
                        }
                    }

                    var groupValue4;
                    if($scope.options.fourthGroupField && $scope.options.fourthGroupField.columnName) {
                        groupValue4 = data[i][$scope.options.fourthGroupField.columnName];

                        if(!$scope.tree[groupValue1][groupValue2][groupValue3][groupValue4]) {
                            $scope.tree[groupValue1][groupValue2][groupValue3][groupValue4] = {
                                tasks: []
                            };
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

                if($scope.options.firstGroupField && $scope.options.firstGroupField.columnName) {
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
                        id: data[i]._id,
                        name: data[i][$scope.bindings.rowTitleField.columnName],
                        from: data[i][$scope.bindings.startField.columnName],
                        to: data[i][$scope.bindings.endField.columnName],
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
                if($scope.options.fourthGroupField && $scope.options.fourthGroupField.columnName) {
                    groupValues[0] = node[$scope.options.firstGroupField.columnName];
                    groupValues[1] = node[$scope.options.secondGroupField.columnName];
                    groupValues[2] = node[$scope.options.thirdGroupField.columnName];
                    groupValues[3] = node[$scope.options.fourthGroupField.columnName];
                    parent = $scope.tree[groupValues[0]][groupValues[1]][groupValues[2]][groupValues[3]];
                } else if($scope.options.thirdGroupField && $scope.options.thirdGroupField.columnName) {
                    groupValues[0] = node[$scope.options.firstGroupField.columnName];
                    groupValues[1] = node[$scope.options.secondGroupField.columnName];
                    groupValues[2] = node[$scope.options.thirdGroupField.columnName];
                    parent = $scope.tree[groupValues[0]][groupValues[1]][groupValues[2]];
                } else if($scope.options.secondGroupField && $scope.options.secondGroupField.columnName) {
                    groupValues[0] = node[$scope.options.firstGroupField.columnName];
                    groupValues[1] = node[$scope.options.secondGroupField.columnName];
                    parent = $scope.tree[groupValues[0]][groupValues[1]];
                } else if($scope.options.firstGroupField && $scope.options.firstGroupField.columnName) {
                    parent = $scope.tree[node[$scope.options.firstGroupField.columnName]];
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
                $scope.fields = datasetService.getSortedFields($scope.options.database.name, $scope.options.table.name);

                var rowTitleField = $scope.bindRowTitleField || "_id";
                $scope.bindings.rowTitleField = _.find($scope.fields, function(field) {
                    return field.columnName === rowTitleField;
                }) || {
                    columnName: "",
                    prettyName: ""
                };
                var startField = $scope.bindRowTitleField || "Start";
                $scope.bindings.startField = _.find($scope.fields, function(field) {
                    return field.columnName === startField;
                }) || {
                    columnName: "",
                    prettyName: ""
                };
                var endField = $scope.bindRowTitleField || "End";
                $scope.bindings.endField = _.find($scope.fields, function(field) {
                    return field.columnName === endField;
                }) || {
                    columnName: "",
                    prettyName: ""
                };

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

            neon.ready(function() {
                $scope.messenger = new neon.eventing.Messenger();
                initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
