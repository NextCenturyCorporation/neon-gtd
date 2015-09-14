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

/**
 * This Angular JS directive adds a button to a page that allows a user to delete a dataset from a database, given a username and
 * database name associated with that dataset.
 *
 * @namespace neonDemo.directives
 * @constructor
 */

angular.module('neonDemo.directives')
.directive('removeDataset', ['ConnectionService', 'ErrorNotificationService', 'ImportService', 'DatasetService',
    function(connectionService, errorNotificationService, importService, datasetService) {
    return {
        templateUrl: 'partials/directives/removeDataset.html',
        restrict: 'EA',
        link: function($scope, $element) {
            $scope.removeDatasetUserName = '';
            $scope.removeDatasetDatabaseName = '';
            $scope.datastoreType = datasetService.getDatastore() || 'mongo';
            $scope.datastoreHost = datasetService.getHostname() || 'localhost';

            /**
             * Sends a request to remove a dataset associated with the username and database name currently entered in the text fields.
             * @method $scope.removeDataset
             */
            $scope.removeDataset = function() {
                importService.setUserName($scope.removeDatasetUserName);
                var connection = connectionService.getActiveConnection();
                if(!connection || !$scope.removeDatasetUserName || !$scope.removeDatasetDatabaseName) {
                    return;
                }
                connection.executeRemoveDataset($scope.removeDatasetUserName, $scope.removeDatasetDatabaseName,
                    removeSuccess, removeFailure, $scope.datastoreHost, $scope.datastoreType);
            };

            /**
             * Success callback for $scope.removeDataset. Hides the remove dataset modal.
             * @method removeSuccess
             */
            var removeSuccess = function() {
                $element.find('#removeDatasetModal').modal('hide');
            };

            // TODO - window.alert technically works here, but isn't necessarily the prettiest solution.
            // Should change this to use the errorNotificationService at some point - it's only not doing
            // that now because the error shows up in the options menu rather than the modal for some reason.
            /**
             * Failure callback for $scope.removeDataset. Shows an error message saying what went wrong.
             * @method removeFailure
             * @param {Object} response The response from the server.
             */
            var removeFailure = function(response) {
                if(response.responseJSON && response.responseJSON.message) {
                    window.alert(response.responseJSON.message);
                } else {
                    var result = JSON.parse(response);
                    window.alert(result.message);
                }
            };

            /**
             * Defines on-show behavior of the remove modal. Autofills the username input
             * to be equal to the username stored in the importService and the datastore type and host
             * to be equal to that of the dataset selected on the dashboard (or 'mongo' and 'localhost',
             * respectively, if no dataset selected).
             * @method removeDatasetModalOnShow
             */
            var removeDatasetModalOnShow = function() {
                $scope.removeDatasetDatabaseName = '';
                $scope.removeDatasetUserName = importService.getUserName();
                $scope.datastoreType = datasetService.getDatastore() || 'mongo';
                $scope.datastoreHost = datasetService.getHostname() || 'localhost';
                // Angular doesn't automatically recognize when this changes, so we force it to manually.
                $scope.$apply();
            };

            $element.find('#removeDatasetModal').on('show.bs.modal', removeDatasetModalOnShow);
        }
    };
}]);