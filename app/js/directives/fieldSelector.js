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
.directive('fieldselector', ['DatasetService', function(datasetService) {
    return {
        template: '<label>{{labelText}}</label><select ng-model="targetVar" ng-options="field for field in fields" ng-required="true" ng-disabled="!(fields.length > 0)" class="form-control"><option ng-hide="!(defaultOption)" value="">{{defaultOption}}</option></select>',
        restrict: 'E',
        scope: {
            targetVar: '=',
            labelText: '=',
            defaultMapping: '=',
            defaultOption: '='
        },
        link: function($scope) {
            var messenger = new neon.eventing.Messenger();
            $scope.database = '';
            $scope.tableName = '';
            $scope.fields = [];
            $scope.tmp = "";

            var initialize = function() {
                messenger.events({
                    activeDatasetChanged: onDatasetChanged
                });

                $scope.$on('$destroy', function() {
                    messenger.removeEvents();
                });
            };

            var onDatasetChanged = function() {
                $scope.displayActiveDataset(false);
            };

            var onSelectionChange = function(newVal, oldVal) {
                XDATA.activityLogger.logUserActivity('FieldSelector - user changed a field selection', 'define_axes',
                    XDATA.activityLogger.WF_CREATE,
                    {
                        field: $scope.labelText,
                        to: newVal,
                        from: oldVal
                    });
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

                $scope.databaseName = datasetService.getDatabase();
                $scope.tableName = datasetService.getTable();

                if(initializing) {
                    $scope.fields = datasetService.getDatabaseFields();
                } else {
                    $scope.$apply(function() {
                        $scope.fields = datasetService.getDatabaseFields();
                    });
                }

                if($scope.defaultOption) {
                    $scope.targetVar = $scope.defaultOption;
                }
                if($scope.defaultMapping) {
                    $scope.targetVar = datasetService.getMapping($scope.defaultMapping);
                }
            };

            $scope.$watch("targetVar", onSelectionChange);

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
