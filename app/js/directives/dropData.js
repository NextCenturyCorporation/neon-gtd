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
 * This Angular JS directive adds a simple button to a page that allows the user to upload a file to the server.
 *
 * @namespace neonDemo.directives
 * @constructor
 */

angular.module('neonDemo.directives')
.directive('dropData', ['ConnectionService', 'ErrorNotificationService', 'ImportService',
    function(connectionService, errorNotificationService, importService) {
    return {
        templateUrl: 'partials/directives/dropData.html',
        restrict: 'EA',
        link: function($scope) {
    		$scope.dropDataset = function() {
    			var username = importService.makeTextSafe(jQuery("#dropUsernameInput")[0].value);
    			var database = importService.makeTextSafe(jQuery("#dropDatabaseInput")[0].value);
    			var connection = connectionService.getActiveConnection();
    			if(!connection || !username || !database) {
    				return;
    			}
    			connection.executeDropData(username, database, dropSuccess, dropFailure);
    		};

    		var dropSuccess = function(response) {
    			jQuery('#dropModal').modal('hide');
    		};

    		var dropFailure = function(response) {
    			window.alert("Sorry, there wasn't any database with that name created by this username.");
    		};

            var dropModalOnShow = function() {
                jQuery('#dropUsernameInput')[0].value = importService.getUserName();
                jQuery('#dropDatabaseInput')[0].value = '';
            };

            jQuery('#dropModal').on('show.bs.modal', dropModalOnShow);
        }
    };
}]);