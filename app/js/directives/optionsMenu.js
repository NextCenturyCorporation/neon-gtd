'use strict';
angular.module('neonDemo.directives')
.directive('optionsMenu', ['ConnectionService', 'ErrorNotificationService', 'ExportService', 'config', function(connectionService, errorNotificationService, exportService, config) {
    return {
        templateUrl: 'partials/directives/optionsMenu.html',
        restrict: 'EA',
        transclude: true,
        scope: {
            parentElement: '=',
            resize: '=?',
            buttonText: '=?',
            showButtonText: '=?',
            exportFunction: '=?'
        },
        link: function($scope, $element) {
            // Buffer needed above and below the chart options popover based on popover position, container padding (both set in the CSS), and UX.
            $scope.CHART_OPTIONS_BUFFER_Y = 65;

            $scope.showExport = config.showExport;
            $scope.optionsDisplayed = false;
            $scope.showSymbol = false;
            $scope.chartOptionsTotalWidth = 0;

            $scope.uniqueVisualizationOptions = 'chart-options-' + uuid();
            $element.find('.chart-options').addClass($scope.uniqueVisualizationOptions);

            $scope.toggleOptionsDisplay = function() {
                $scope.optionsDisplayed = !$scope.optionsDisplayed;
                var activity = ($scope.optionsDisplayed) ? 'show' : 'hide';
                XDATA.userALE.log({
                    activity: activity,
                    action: "click",
                    elementId: $scope.uniqueVisualizationOptions,
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["options"]
                });
            };

            $scope.getButtonText = function() {
                if($.isFunction($scope.buttonText)) {
                    return $scope.buttonText();
                }
                return $scope.buttonText;
            };

            var resizeButton = $scope.resize || function() {
                var chartOptions = $element.find(".chart-options");
                if(!$scope.showSymbol) {
                    $scope.chartOptionsTotalWidth = chartOptions.outerWidth(true);
                }

                var title = $scope.parentElement.find(".title");
                if(title) {
                    $scope.showSymbol = ($scope.chartOptionsTotalWidth + title.outerWidth(true) + 20 > $scope.parentElement.width());
                    // Use jquery hide/show instead of angular here because angular's update was delayed in some cases which cased bad UX.
                    if($scope.showSymbol) {
                        chartOptions.find("#text").hide();
                        chartOptions.find("#symbol").show();
                    } else {
                        chartOptions.find("#text").show();
                        chartOptions.find("#symbol").hide();
                    }
                }
            };

            var resizeMenu = $scope.resize || function() {
                var chartOptions = $element.find(".chart-options");
                var height = $scope.parentElement.innerHeight() - (chartOptions.outerHeight(true) - chartOptions.height() + $scope.CHART_OPTIONS_BUFFER_Y);
                chartOptions.find(".popover-content").css("max-height", height + "px");
            };

            var resizeButtonAndMenu = $scope.resize || function() {
                resizeButton();
                resizeMenu();
            };

            $scope.parentElement.resize(resizeButtonAndMenu);
            $element.find(".chart-options").resize(resizeButton);

            // Resize the options menu to reflect the initial size of the parent element.
            resizeButtonAndMenu();

            if($scope.resize) {
                $element.find("#text").show();
            }

            var exportSuccess = function(queryResults) {
                window.location.assign("/neon/services/exportservice/generateZip/" + queryResults.data);
            };

            var exportFail = function(response) {
                if(response.responseJSON) {
                    $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                }
            };

            $scope.requestExport = function() {
                if(!$scope.exportFunction) {
                    return;
                }
                var connection = connectionService.getActiveConnection();
                if(!connection) {
                    //This is temporary. Come up with better code for if there isn't a connection.
                    return;
                }
                var data = $scope.exportFunction();
                connection.executeExport(data, exportSuccess, exportFail, exportService.getFileFormat());
            };
        }
    };
}]);
