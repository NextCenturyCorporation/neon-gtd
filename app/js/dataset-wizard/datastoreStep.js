'use strict';
/*
 * Copyright 2016 Next Century Corporation
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
.directive('datastoreStep', ['DatasetService', 'ConnectionService',
    function(datasetService, connectionService) {
    return {
        templateUrl: 'partials/dataset-wizard/datastoreStep.html',
        restrict: 'E',
        require: '^wizard',
        scope: {
            storeSelect: '=',
            hostName: '=',
            datasets: '=',
            stepNumber: '='
        },
        link: function($scope, $element, $attrs, wizardCtrl) {
            $scope.datasetNameIsValid = false;
            $scope.datasetName = "";
            $scope.isConnected = false;
            $scope.isLoading = false;
            $scope.isSelected = false;
            $scope.datastoreType = $scope.storeSelect || 'mongo';
            $scope.datastoreHost = $scope.hostName || 'localhost';
            $scope.databases = [];

            /**
             * Validates the global dataset name by checking if its already in use by another dataset.
             * @method validateDatasetName
             */
            $scope.validateDatasetName = function() {
                $scope.datasetNameIsValid = ($scope.datasetName !== "");
                $scope.datasets.forEach(function(dataset) {
                    if(dataset.name === $scope.datasetName) {
                        $scope.datasetNameIsValid = false;
                    }
                });
            };

            /**
             * Triggered by selecting a datastore type.
             * @method changeType
             */
            $scope.changeType = function() {
                $scope.isConnected = false;
            };

            /**
             * Triggered by entering a host name.
             * @method changeHost
             */
            $scope.changeHost = function() {
                $scope.isConnected = false;
            };

            /**
             * Connects to the data server with the global datastore type and host.
             * @method connectToServer
             */
            $scope.connectToServer = function() {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "dataset-selector",
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", $scope.datastoreType]
                });

                var connection = connectionService.createActiveConnection($scope.datastoreType, $scope.datastoreHost);
                if(!connection) {
                    return;
                }

                $scope.isLoading = true;

                connection.getDatabaseNames(function(databaseNames) {
                    $scope.$apply(function() {
                        databaseNames.forEach(function(databaseName) {
                            $scope.databases.push({
                                name: databaseName,
                                prettyName: databaseName,
                                tables: []
                            });
                        });
                        updateDatabases(connection);
                    });
                }, function() {
                    $scope.$apply(function() {
                        $scope.isLoading = false;
                        $scope.isConnected = false;
                        $scope.error = true;
                    });
                });
            };

            /**
             * Updates the list of databases with their tables and field names.
             * @param {neon.query.Connection} connection Connection to use to connection to neon.
             * @param {Number} index Index in the global databases list that the function is getting the tables
             * and field names for.
             * @method updateDatabases
             * @private
             */
            var updateDatabases = function(connection, index) {
                var databaseIndex = index ? index : 0;
                var database = $scope.databases[databaseIndex];
                connection.getTableNamesAndFieldNames(database.name, function(tableNamesAndFieldNames) {
                    $scope.$apply(function() {
                        Object.keys(tableNamesAndFieldNames).forEach(function(tableName) {
                            var table = {
                                name: tableName,
                                prettyName: tableName,
                                fields: [],
                                mappings: {}
                            };

                            tableNamesAndFieldNames[tableName].forEach(function(fieldName) {
                                table.fields.push({
                                    columnName: fieldName,
                                    prettyName: fieldName
                                });
                            });

                            database.tables.push(table);
                        });

                        if(++databaseIndex < $scope.databases.length) {
                            updateDatabases(connection, databaseIndex);
                        } else {
                            wizardCtrl.updateDatabases($scope.databases);
                            $scope.isLoading = false;
                            $scope.isConnected = true;
                            $scope.error = false;
                        }
                    });
                }, function() {
                    $scope.$apply(function() {
                        $scope.isLoading = false;
                        $scope.isConnected = false;
                        $scope.error = true;
                    });
                });
            };

            /*
             * Returns whether she step is valid and can go on to the next step.
             * @return {Boolean}
             * @method validateStep
             * @private
             */
            var validateStep = function() {
                return $scope.datasetNameIsValid && $scope.isConnected;
            };

            /*
             * Shows/hides this step.
             * @param {Boolean} selected
             * @method selected
             * @private
             */
            var selected = function(selected) {
                $scope.isSelected = selected;
            };

            /*
             * Function to call on step initialization.
             * @method init
             * @private
             */
            var init = function() {
                $scope.datasetNameIsValid = false;
                $scope.datasetName = "";
                $scope.isConnected = false;
                $scope.isLoading = false;
                $scope.datastoreType = $scope.storeSelect || 'mongo';
                $scope.datastoreHost = $scope.hostName || 'localhost';
                $scope.databases = [];
            };

            /*
             * Function to call when the step finishes.
             * @method onFinish
             * @private
             */
            var onFinish = function() {
                wizardCtrl.setDatastore({
                    type: $scope.datastoreType,
                    host: $scope.datastoreHost,
                    name: $scope.datasetName
                });
            };

            wizardCtrl.addStep({
                title: "Connect to Datastore",
                stepNumber: $scope.stepNumber,
                validateStep: validateStep,
                selected: selected,
                init: init,
                onFinish: onFinish
            });
        }
    };
}]);
